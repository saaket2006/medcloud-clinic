import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'qa', 'audit-results');
const CHROME_PROFILE = path.join(OUTPUT_DIR, 'chrome-profile');
const FRONTEND_URL = 'http://127.0.0.1:5173';
const BACKEND_URL = 'http://127.0.0.1:8081';
const DEBUG_PORT = 9333;
const PYTHON_PATH = 'D:\\Applications\\python 3.11\\python.exe';
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function pathExists(filePath) {
  try {
    await import('node:fs/promises').then(fs => fs.access(filePath));
    return true;
  } catch {
    return false;
  }
}

async function waitForUrl(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await wait(1000);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'no response'}`);
}

function startProcess(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  return { child, output: () => output };
}

function stopProcess(child) {
  if (!child || child.killed) return;
  try {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      shell: true,
      windowsHide: true,
      stdio: 'ignore'
    });
  } catch {
    child.kill();
  }
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      const callbacks = this.listeners.get(message.method) || [];
      callbacks.forEach(callback => callback(message.params));
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, callback) {
    const callbacks = this.listeners.get(method) || [];
    callbacks.push(callback);
    this.listeners.set(method, callbacks);
  }
}

async function connectCdp() {
  const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(response => response.json());
  const target = targets.find(item => item.type === 'page');
  if (!target) throw new Error('Chrome did not expose a page target.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return new CdpClient(socket);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  }
  return result.result.value;
}

async function navigate(cdp, url) {
  const loaded = new Promise(resolve => {
    const handler = () => resolve();
    cdp.on('Page.loadEventFired', handler);
  });
  await cdp.send('Page.navigate', { url });
  await Promise.race([loaded, wait(12000)]);
  await wait(1500);
}

async function waitFor(cdp, predicate, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, predicate)) return true;
    await wait(250);
  }
  return false;
}

async function setViewport(cdp, width, height, mobile = false) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height
  });
}

async function capture(cdp, name, viewport) {
  await setViewport(cdp, viewport.width, viewport.height, viewport.mobile);
  await wait(400);
  const pageName = `${name}-${viewport.label}`;
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true
  });
  await writeFile(path.join(OUTPUT_DIR, `${pageName}.png`), Buffer.from(screenshot.data, 'base64'));

  const dom = await evaluate(cdp, 'document.documentElement.outerHTML');
  await writeFile(path.join(OUTPUT_DIR, `${pageName}.html`), dom, 'utf8');

  const diagnostics = await evaluate(cdp, `(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const describe = element => {
      const id = element.id ? '#' + element.id : '';
      const classes = [...element.classList].slice(0, 3).map(value => '.' + value).join('');
      return element.tagName.toLowerCase() + id + classes;
    };
    const overflowing = [...document.querySelectorAll('body *')].filter(visible).filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.left < -2 || rect.right > innerWidth + 2;
    }).slice(0, 30).map(element => ({ element: describe(element), text: (element.textContent || '').trim().slice(0, 80), rect: element.getBoundingClientRect().toJSON() }));
    const brokenImages = [...document.images].filter(image => image.complete && image.naturalWidth === 0).map(image => image.src);
    const unnamedButtons = [...document.querySelectorAll('button')].filter(visible).filter(button => !(button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim())).map(describe);
    const unlabeledInputs = [...document.querySelectorAll('input, textarea, select')].filter(visible).filter(input => {
      if (input.type === 'hidden') return false;
      return !(input.labels?.length || input.getAttribute('aria-label') || input.getAttribute('aria-labelledby'));
    }).map(describe);
    const emptyLinks = [...document.querySelectorAll('a')].filter(visible).filter(link => !(link.textContent.trim() || link.getAttribute('aria-label') || link.querySelector('img[alt]'))).map(describe);
    return {
      title: document.title,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      documentSize: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      overflowing,
      brokenImages,
      unnamedButtons,
      unlabeledInputs,
      emptyLinks,
      bodyText: document.body.innerText.slice(0, 500)
    };
  })()`);
  return diagnostics;
}

async function fill(cdp, selector, value) {
  const serializedSelector = JSON.stringify(selector);
  const serializedValue = JSON.stringify(value);
  await evaluate(cdp, `(() => {
    const element = document.querySelector(${serializedSelector});
    if (!element) throw new Error('Missing element: ' + ${serializedSelector});
    element.focus();
    element.value = ${serializedValue};
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

async function click(cdp, selector) {
  const serializedSelector = JSON.stringify(selector);
  return evaluate(cdp, `(() => {
    const element = document.querySelector(${serializedSelector});
    if (!element) return false;
    element.click();
    return true;
  })()`);
}

async function login(cdp, role, email, password = 'password123', remember = false) {
  await navigate(cdp, `${FRONTEND_URL}/login.html`);
  await click(cdp, `#btn-${role.toLowerCase()}`);
  await fill(cdp, '#email', email);
  await fill(cdp, '#password', password);
  if (remember) await click(cdp, '#remember');
  await click(cdp, '#login-form button[type="submit"]');
  await waitFor(cdp, `location.pathname.endsWith('${role.toLowerCase()}-dashboard.html')`, 15000);
  return evaluate(cdp, `({ url: location.href, local: { token: localStorage.getItem('medcloud_token'), role: localStorage.getItem('medcloud_role') }, session: { token: sessionStorage.getItem('medcloud_token'), role: sessionStorage.getItem('medcloud_role') }, toast: [...document.querySelectorAll('.fixed')].map(node => node.textContent.trim()).find(text => /login|credentials|role/i.test(text)) || '' })`);
}

async function main() {
  const manageServers = !process.argv.includes('--servers-running');
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const chromePath = (await Promise.all(CHROME_PATHS.map(async candidate => [candidate, await pathExists(candidate)]))).find(([, exists]) => exists)?.[0];
  if (!chromePath) throw new Error('Chrome or Edge executable was not found.');

  const backend = manageServers ? startProcess('cmd.exe', ['/d', '/s', '/c', 'mvnw.cmd spring-boot:run'], path.join(ROOT, 'backend')) : null;
  const frontend = manageServers ? startProcess(PYTHON_PATH, ['-m', 'http.server', '5173', '--directory', 'frontend'], ROOT) : null;
  let chrome;
  const report = {
    startedAt: new Date().toISOString(),
    consoleErrors: [],
    networkErrors: [],
    checks: [],
    captures: {}
  };

  try {
    await Promise.all([
      waitForUrl(`${BACKEND_URL}/actuator/health`),
      waitForUrl(`${FRONTEND_URL}/login.html`)
    ]);

    chrome = spawn(chromePath, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${CHROME_PROFILE}`,
      'about:blank'
    ], { windowsHide: true, stdio: 'ignore' });
    await waitForUrl(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 30000);

    const cdp = await connectCdp();
    await Promise.all([
      cdp.send('Page.enable'),
      cdp.send('Runtime.enable'),
      cdp.send('Network.enable'),
      cdp.send('Log.enable')
    ]);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "window.MEDCLOUD_API_BASE_URL = 'http://127.0.0.1:8081/api/v1';"
    });
    cdp.on('Runtime.exceptionThrown', params => report.consoleErrors.push({ type: 'exception', text: params.exceptionDetails?.text, url: params.exceptionDetails?.url, line: params.exceptionDetails?.lineNumber }));
    cdp.on('Log.entryAdded', params => {
      if (params.entry.level === 'error') report.consoleErrors.push({ type: 'log', text: params.entry.text, url: params.entry.url });
    });
    cdp.on('Network.loadingFailed', params => report.networkErrors.push({ type: 'failed', url: params.requestId, error: params.errorText }));
    cdp.on('Network.responseReceived', params => {
      if (params.response.status >= 400) report.networkErrors.push({ type: 'http', status: params.response.status, url: params.response.url });
    });

    const desktop = { label: 'desktop', width: 1440, height: 900, mobile: false };
    const mobile = { label: 'mobile', width: 390, height: 844, mobile: true };

    await navigate(cdp, `${FRONTEND_URL}/index.html`);
    report.captures.indexDesktop = await capture(cdp, '01-index', desktop);
    report.captures.indexMobile = await capture(cdp, '01-index', mobile);

    await navigate(cdp, `${FRONTEND_URL}/login.html`);
    report.captures.loginDesktop = await capture(cdp, '02-login', desktop);
    report.captures.loginMobile = await capture(cdp, '02-login', mobile);

    const mismatch = await login(cdp, 'PATIENT', 'aryan@medcloudclinic.com');
    report.checks.push({ name: 'role mismatch stays on login', passed: mismatch.url.endsWith('/login.html') && !mismatch.local.token && !mismatch.session.token, details: mismatch });

    const patientLogin = await login(cdp, 'PATIENT', 'ananya@medcloudclinic.com');
    report.checks.push({ name: 'patient login routes to patient dashboard', passed: patientLogin.url.endsWith('/patient-dashboard.html') && Boolean(patientLogin.session.token), details: patientLogin });
    report.captures.patientDesktop = await capture(cdp, '03-patient-dashboard', desktop);
    report.captures.patientMobile = await capture(cdp, '03-patient-dashboard', mobile);

    await navigate(cdp, `${FRONTEND_URL}/doctor-dashboard.html`);
    const patientDoctorAttempt = await evaluate(cdp, 'location.pathname');
    report.checks.push({ name: 'patient blocked from doctor dashboard', passed: patientDoctorAttempt.endsWith('/patient-dashboard.html'), details: patientDoctorAttempt });

    await navigate(cdp, `${FRONTEND_URL}/appointment-booking.html`);
    report.captures.bookingDesktop = await capture(cdp, '04-appointment-booking', desktop);
    report.captures.bookingMobile = await capture(cdp, '04-appointment-booking', mobile);

    await navigate(cdp, `${FRONTEND_URL}/medical-records.html`);
    report.captures.recordsDesktop = await capture(cdp, '05-medical-records', desktop);
    report.captures.recordsMobile = await capture(cdp, '05-medical-records', mobile);

    await navigate(cdp, `${FRONTEND_URL}/edit-profile.html`);
    report.captures.profileDesktop = await capture(cdp, '06-edit-profile', desktop);
    report.captures.profileMobile = await capture(cdp, '06-edit-profile', mobile);

    await navigate(cdp, `${FRONTEND_URL}/patient-dashboard.html`);
    await evaluate(cdp, `window.handleLogout({ preventDefault() {} })`);
    await waitFor(cdp, `location.pathname.endsWith('/index.html')`);
    const logoutState = await evaluate(cdp, `({ url: location.href, localToken: localStorage.getItem('medcloud_token'), sessionToken: sessionStorage.getItem('medcloud_token') })`);
    report.checks.push({ name: 'logout clears session and returns home', passed: logoutState.url.endsWith('/index.html') && !logoutState.localToken && !logoutState.sessionToken, details: logoutState });
    await navigate(cdp, `${FRONTEND_URL}/login.html`);
    await wait(1000);
    const afterLogoutLogin = await evaluate(cdp, 'location.pathname');
    report.checks.push({ name: 'login after logout asks for credentials', passed: afterLogoutLogin.endsWith('/login.html'), details: afterLogoutLogin });

    const doctorLogin = await login(cdp, 'DOCTOR', 'aryan@medcloudclinic.com');
    report.checks.push({ name: 'doctor login routes to doctor dashboard', passed: doctorLogin.url.endsWith('/doctor-dashboard.html'), details: doctorLogin });
    report.captures.doctorDesktop = await capture(cdp, '07-doctor-dashboard', desktop);
    report.captures.doctorMobile = await capture(cdp, '07-doctor-dashboard', mobile);
    await navigate(cdp, `${FRONTEND_URL}/admin-dashboard.html`);
    const doctorAdminAttempt = await evaluate(cdp, 'location.pathname');
    report.checks.push({ name: 'doctor blocked from admin dashboard', passed: doctorAdminAttempt.endsWith('/doctor-dashboard.html'), details: doctorAdminAttempt });
    await evaluate(cdp, `window.handleLogout({ preventDefault() {} })`);

    const adminLogin = await login(cdp, 'ADMIN', 'saaket@medcloudclinic.com');
    report.checks.push({ name: 'admin login routes to admin dashboard', passed: adminLogin.url.endsWith('/admin-dashboard.html'), details: adminLogin });
    report.captures.adminDesktop = await capture(cdp, '08-admin-dashboard', desktop);
    report.captures.adminMobile = await capture(cdp, '08-admin-dashboard', mobile);
    await navigate(cdp, `${FRONTEND_URL}/analytics.html`);
    report.captures.analyticsDesktop = await capture(cdp, '09-analytics', desktop);
    report.captures.analyticsMobile = await capture(cdp, '09-analytics', mobile);

    await evaluate(cdp, `window.handleLogout({ preventDefault() {} })`);
    const rememberedLogin = await login(cdp, 'PATIENT', 'ananya@medcloudclinic.com', 'password123', true);
    report.checks.push({ name: 'remember me uses persistent storage', passed: Boolean(rememberedLogin.local.token) && !rememberedLogin.session.token, details: rememberedLogin });

    report.finishedAt = new Date().toISOString();
    report.summary = {
      passed: report.checks.filter(check => check.passed).length,
      failed: report.checks.filter(check => !check.passed).length,
      consoleErrors: report.consoleErrors.length,
      networkErrors: report.networkErrors.length,
      pagesWithHorizontalOverflow: Object.entries(report.captures).filter(([, value]) => value.horizontalOverflow).map(([name]) => name),
      pagesWithBrokenImages: Object.entries(report.captures).filter(([, value]) => value.brokenImages.length).map(([name]) => name)
    };
    await writeFile(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report.summary, null, 2));
    if (report.summary.failed > 0) process.exitCode = 2;
  } catch (error) {
    await writeFile(path.join(OUTPUT_DIR, 'runner-error.txt'), `${error.stack}\n`, 'utf8');
    if (backend) await writeFile(path.join(OUTPUT_DIR, 'backend-output.txt'), backend.output(), 'utf8');
    if (frontend) await writeFile(path.join(OUTPUT_DIR, 'frontend-output.txt'), frontend.output(), 'utf8');
    throw error;
  } finally {
    if (chrome) stopProcess(chrome);
    if (frontend) stopProcess(frontend.child);
    if (backend) stopProcess(backend.child);
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
