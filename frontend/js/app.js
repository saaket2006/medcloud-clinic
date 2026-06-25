// Central browser logic for MedCloud Clinic.

const API_PREFIX = '/api/v1';
const AUTH_KEYS = ['medcloud_token', 'medcloud_role', 'medcloud_user_email'];
const VALID_ROLES = new Set(['ADMIN', 'DOCTOR', 'PATIENT']);

const DASHBOARD_BY_ROLE = {
  ADMIN: 'admin-dashboard.html',
  DOCTOR: 'doctor-dashboard.html',
  PATIENT: 'patient-dashboard.html'
};

const PAGE_ACCESS = {
  'admin-dashboard.html': ['ADMIN'],
  'analytics.html': ['ADMIN'],
  'doctor-dashboard.html': ['ADMIN', 'DOCTOR'],
  'patient-dashboard.html': ['PATIENT'],
  'appointment-booking.html': ['ADMIN', 'DOCTOR', 'PATIENT'],
  'medical-records.html': ['ADMIN', 'DOCTOR', 'PATIENT'],
  'edit-profile.html': ['ADMIN', 'DOCTOR', 'PATIENT']
};

const PUBLIC_PAGES = new Set(['', 'index.html', 'login.html']);

function getCurrentPage() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function isProtectedPage(page = getCurrentPage()) {
  return !PUBLIC_PAGES.has(page);
}

if (isProtectedPage()) {
  document.documentElement.classList.add('auth-checking');
}

function getApiCandidates() {
  const explicitBase = window.MEDCLOUD_API_BASE_URL;
  const rememberedBase = localStorage.getItem('medcloud_api_base');
  const candidates = [];

  if (explicitBase) candidates.push(explicitBase);
  if (rememberedBase) candidates.push(rememberedBase);

  if (window.location.protocol.startsWith('http') && window.location.origin) {
    candidates.push(`${window.location.origin}${API_PREFIX}`);
  }

  candidates.push('http://localhost:8081/api/v1');
  candidates.push('http://localhost:8080/api/v1');

  return [...new Set(candidates.map(base => base.replace(/\/$/, '')))];
}

function getStoredSession() {
  const stores = [localStorage, sessionStorage];

  for (const store of stores) {
    const token = store.getItem('medcloud_token');
    const role = (store.getItem('medcloud_role') || '').toUpperCase();
    const email = store.getItem('medcloud_user_email') || '';

    if (token && VALID_ROLES.has(role)) {
      return { token, role, email, store };
    }
  }

  return null;
}

function clearSession() {
  [localStorage, sessionStorage].forEach(store => {
    AUTH_KEYS.forEach(key => store.removeItem(key));
  });
}

function saveSession({ token, role, email }, remember) {
  clearSession();
  const store = remember ? localStorage : sessionStorage;
  store.setItem('medcloud_token', token);
  store.setItem('medcloud_role', role);
  if (email) store.setItem('medcloud_user_email', email);
}

function redirectToDashboard(role, query = '') {
  const target = DASHBOARD_BY_ROLE[role] || DASHBOARD_BY_ROLE.PATIENT;
  window.location.replace(query ? `${target}${query}` : target);
}

async function requestApi(endpoint, options = {}) {
  let lastError;

  for (const baseUrl of getApiCandidates()) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if ([404, 405, 501].includes(response.status)) {
        lastError = new Error(`No API endpoint at ${baseUrl}${endpoint}`);
        continue;
      }

      localStorage.setItem('medcloud_api_base', baseUrl);
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to reach the MedCloud API.');
}

/**
 * Common fetch wrapper to include Authorization header.
 */
async function apiFetch(endpoint, options = {}) {
  const session = getStoredSession();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  const response = await requestApi(endpoint, {
    ...options,
    headers
  });

  if (response.status === 401 || response.status === 403) {
    clearSession();
    if (getCurrentPage() !== 'login.html') {
      window.location.replace('login.html?expired=true');
    }
  }

  return response;
}

function showNotification(message, type = 'info') {
  if (!document.body) return;

  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 max-w-sm p-4 rounded-xl shadow-lg z-50 transition-all duration-300 transform translate-y-10 opacity-0 ${
    type === 'error' ? 'bg-error-container text-on-error-container' :
    type === 'success' ? 'bg-secondary-container text-on-secondary-container' :
    'bg-primary-fixed text-on-primary-fixed'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-10', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function selectRole(role) {
  const normalizedRole = role.toUpperCase();
  const selectedRoleInput = document.getElementById('selectedRole');

  if (selectedRoleInput) {
    selectedRoleInput.value = normalizedRole;
  }

  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.classList.remove('border-primary', 'bg-primary-fixed/30', 'text-primary');
    btn.classList.add('border-transparent', 'bg-surface-container-low', 'text-on-surface-variant');
  });

  const activeBtn = document.getElementById(`btn-${normalizedRole.toLowerCase()}`);
  if (activeBtn) {
    activeBtn.classList.remove('border-transparent', 'bg-surface-container-low', 'text-on-surface-variant');
    activeBtn.classList.add('border-primary', 'bg-primary-fixed/30', 'text-primary');
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('email')?.value.trim().toLowerCase();
  const password = document.getElementById('password')?.value;
  const requestedRole = (document.getElementById('selectedRole')?.value || 'PATIENT').toUpperCase();
  const remember = Boolean(document.getElementById('remember')?.checked);
  const submitBtn = event.target.querySelector('button[type="submit"]');

  if (!email || !password) {
    showNotification('Both fields are required.', 'error');
    return;
  }

  if (!VALID_ROLES.has(requestedRole)) {
    showNotification('Choose a valid access role.', 'error');
    return;
  }

  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="inline-block animate-spin mr-2">...</span> Authenticating...';

  try {
    const response = await requestApi('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showNotification(data.error || 'Login failed. Please check your credentials.', 'error');
      return;
    }

    const actualRole = (data.role || '').toUpperCase();
    if (!data.token || !VALID_ROLES.has(actualRole)) {
      showNotification('The server returned an invalid login response.', 'error');
      return;
    }

    if (actualRole !== requestedRole) {
      clearSession();
      showNotification(`These credentials belong to a ${actualRole.toLowerCase()} account. Select the matching role to continue.`, 'error');
      return;
    }

    saveSession({ token: data.token, role: actualRole, email }, remember);
    showNotification('Login successful. Redirecting...', 'success');
    setTimeout(() => redirectToDashboard(actualRole), 350);
  } catch (error) {
    console.error('Login error:', error);
    showNotification('Backend service is unavailable on ports 8080 and 8081.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
}

function isPageAllowed(page, role) {
  const allowedRoles = PAGE_ACCESS[page];
  return !allowedRoles || allowedRoles.includes(role);
}

function checkAuth() {
  const page = getCurrentPage();
  const session = getStoredSession();

  if (page === 'login.html') {
    clearSession();
    document.documentElement.classList.remove('auth-checking');
    return;
  }

  if (PUBLIC_PAGES.has(page)) {
    document.documentElement.classList.remove('auth-checking');
    return;
  }

  if (!session) {
    clearSession();
    window.location.replace('login.html');
    return;
  }

  if (!isPageAllowed(page, session.role)) {
    redirectToDashboard(session.role, '?unauthorized=true');
    return;
  }

  document.documentElement.classList.remove('auth-checking');
}

function shouldHideNavTarget(href, role, label) {
  const cleanLabel = (label || '').trim().toLowerCase();
  
  if (cleanLabel.includes('staff') || cleanLabel.includes('members') || cleanLabel.includes('management')) {
    return role !== 'ADMIN';
  }

  if (href.includes('admin-dashboard.html')) return role !== 'ADMIN' && !/dashboard|overview/i.test(label);
  if (href.includes('analytics.html')) return role !== 'ADMIN';
  if (href.includes('doctor-dashboard.html')) return !['ADMIN', 'DOCTOR'].includes(role);
  if (href.includes('patient-dashboard.html')) return role !== 'PATIENT';
  if (href.includes('appointment-booking.html')) {
    return role === 'DOCTOR';
  }
  return false;
}

function normalizeNavigation() {
  const session = getStoredSession();
  if (!session) return;

  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href') || '';
    const label = link.textContent || '';

    if (href.includes('admin-dashboard.html') && /dashboard|overview/i.test(label) && session.role !== 'ADMIN') {
      link.setAttribute('href', DASHBOARD_BY_ROLE[session.role]);
      return;
    }

    if (shouldHideNavTarget(href, session.role, label)) {
      link.classList.add('hidden');
      link.setAttribute('aria-hidden', 'true');
      link.setAttribute('tabindex', '-1');
    }
  });

  if (session.role !== 'PATIENT') {
    document.querySelectorAll('button, a').forEach(control => {
      if (/new appointment|book consultation|confirm booking/i.test((control.textContent || '').trim())) {
        control.classList.add('hidden');
        control.setAttribute('aria-hidden', 'true');
        control.setAttribute('tabindex', '-1');
        const parent = control.parentElement;
        if (parent && (parent.classList.contains('px-4') || parent.classList.contains('px-6') || parent.classList.contains('py-4') || parent.classList.contains('mt-auto'))) {
          parent.classList.add('hidden');
        }
      }
    });
  }
}

function updateUnauthorizedNotice() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('unauthorized')) {
    showNotification('You were redirected to your authorized dashboard.', 'error');
    window.history.replaceState({}, document.title, getCurrentPage());
  }
}

function handleLogout(event) {
  if (event) event.preventDefault();
  clearSession();
  window.location.replace('index.html');
}

async function initDashboard() {
  const session = getStoredSession();
  const role = session?.role;
  const userNameElement = document.getElementById('user-name');
  const userRoleElement = document.getElementById('user-role');

  if (userNameElement && session?.email) {
    const profileKey = `medcloud_profile_${session.email}`;
    const savedProfile = localStorage.getItem(profileKey) ? JSON.parse(localStorage.getItem(profileKey)) : null;

    if (savedProfile && savedProfile.name) {
      userNameElement.textContent = savedProfile.name;
    } else if (role === 'ADMIN') {
      userNameElement.textContent = 'Saaket Baldawa';
    } else if (role === 'DOCTOR') {
      userNameElement.textContent = 'Dr. Aryan Sharma';
    } else {
      userNameElement.textContent = 'Ananya Kulkarni';
    }
  } else if (userNameElement) {
    if (role === 'ADMIN') {
      userNameElement.textContent = 'Saaket Baldawa';
    } else if (role === 'DOCTOR') {
      userNameElement.textContent = 'Dr. Aryan Sharma';
    } else {
      userNameElement.textContent = 'Ananya Kulkarni';
    }
  }

  if (userRoleElement && role) {
    userRoleElement.textContent = `${role} Access`;
  }

  const DEFAULT_AVATARS = {
    ADMIN: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBT_hvwq9TYIJqSJfUvJzjQDVCQ0GQw5TwXVgfC9vaHh8EXMEEkql0QQqArY4qHWmYo0yvKywCODYB4-YZuuJP0NbpnK6qq_bk1L5ARrTBYVOmRb7Ie3sqZ809mG3BCg_pjiSQuPZ9RO5Sa8J4sb0u1KLtjALZkY1VfazIhwMax7RxSGBNNKmXDTZPjrAjifLJVOs0bgzwr6P0Umtu_8jERCInKs1mOo2salH3aCSjFpv6fsTfPtqcrfkB0r543LrcL_-8A3c4-X60X',
    DOCTOR: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAA2uDi2SitOnrv0PUyGaoYzsg8AJI7aB6VFnrnWfnZXXHaKH3rE8WQt1KLCiVMsSDbBJvE8DdR2o5Vi1zFQAM2ukgSeakviVzG3hbpwhQMrFSEOCqtkEhKwqY5WtvsQK6wNVBXFXc95vj1HR_0WCqnrU7jUOR9lxVjEQS5MUWpHsZ_umQXOfojweGrc3_bKCduC5tshXPoD26Kjs0ucxffPSh8XmGw28TDyMqzQoJVwHvOSgPwIQrUgHgfAYpOXCOAXDTUDkF87epH',
    PATIENT: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD7FSXWB4hGykIbSfLVD9wS3Ae0JdfbykXJPEK63H_MsspTIwE7Wwu8sfCWHsUp4Hhxqd5uiOrNb4SPnX7sMb9N-dMweOAegXF7J5rMIOsqEJxji7Ta2X2F8LeTOENDQEdXUq2BSnvhegCznZ6nj2l-deVA3sIK0GfykooR7acOsfgx5xwI_m7DXvh6LnxIqCifJcClIBosWOVO14AvtJdnG4JukVn3b2_WI_FNEJHPFDEH031ekUDPb-rUwTRBh8kbhXLz8596Affu'
  };

  const headerAvatar = document.getElementById('user-avatar') || document.querySelector('header img, nav img');
  if (headerAvatar && role && DEFAULT_AVATARS[role]) {
    headerAvatar.src = DEFAULT_AVATARS[role];
    if (userNameElement) {
      headerAvatar.alt = userNameElement.textContent + ' Profile';
    }
  }

  const appointmentsContainer = document.getElementById('appointments-list');
  if (appointmentsContainer) {
    appointmentsContainer.innerHTML = '<div class="p-8 text-center text-on-surface-variant">Loading appointments...</div>';
    try {
      const response = await apiFetch('/appointments/my');
      if (response.ok) {
        const appointments = await response.json();
        window.myAppointments = appointments;

        // By default, show only active (SCHEDULED) appointments
        const activeAppointments = appointments.filter(app => app.status === 'SCHEDULED');
        renderAppointments(activeAppointments, appointmentsContainer, role);

        // Update stats card dynamically if on patient dashboard
        const countElement = document.getElementById('upcoming-appointments-count');
        const statusElement = document.getElementById('upcoming-appointments-status');
        if (countElement) {
          countElement.textContent = String(activeAppointments.length).padStart(2, '0');
        }
        if (statusElement) {
          if (activeAppointments.length === 0) {
            statusElement.innerHTML = `
              <span class="material-symbols-outlined text-xs text-on-surface-variant">info</span>
              No upcoming appointments
            `;
          } else {
            statusElement.innerHTML = `
              <span class="material-symbols-outlined text-xs text-secondary">verified</span>
              Confirmed appointments
            `;
          }
        }

        // Configure View Full History / Show Upcoming Toggle
        const viewHistoryBtn = document.getElementById('btn-view-history');
        if (viewHistoryBtn) {
          const newBtn = viewHistoryBtn.cloneNode(true);
          viewHistoryBtn.parentNode.replaceChild(newBtn, viewHistoryBtn);
          
          newBtn.addEventListener('click', () => {
            const isShowingAll = newBtn.getAttribute('data-showing-all') === 'true';
            if (isShowingAll) {
              const currentActive = window.myAppointments.filter(app => app.status === 'SCHEDULED');
              renderAppointments(currentActive, appointmentsContainer, role);
              newBtn.setAttribute('data-showing-all', 'false');
              newBtn.textContent = 'View Full History';
            } else {
              renderAppointments(window.myAppointments, appointmentsContainer, role);
              newBtn.setAttribute('data-showing-all', 'true');
              newBtn.textContent = 'Show Upcoming Only';
            }
          });
        }
      } else {
        appointmentsContainer.innerHTML = '<div class="p-8 text-center text-error">Failed to load appointments.</div>';
      }
    } catch (error) {
      console.error('Error loading appointments:', error);
      appointmentsContainer.innerHTML = '<div class="p-8 text-center text-error">Backend unavailable. Showing offline mode.</div>';
    }
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DOCTOR_METADATA = {
  'Dr. Sangeeta Rao': {
    specialty: 'General Cardiology',
    location: 'Main Building, Wing B',
    imgSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuADMxcEe23s629vZNIREjMaYtkW2LmP7OYwxUazQ_ez8s31VlTrCZ-1rSX7qgTM-Uu-5VmwdgA_36bMgnbHMEpjmU53uSCaw8mjdFrKSKuE9wA2VYW87oTq2rejTzolA80Wv2JKY4rlPgw8MxKKAN-TkyPGiyyjUsPlNEV07AcYvAkIlpQWVK1wjrZfgcoVvgpr42PoDoaByzo1CLtSYbszaTUTCepKOQK6JyeipASDfJCRsnzN1BZbU26OIRfBlKF_n8iY_s-W4bPm'
  },
  'Dr. Rajesh Iyer': {
    specialty: 'Interventional Cardiology',
    location: 'Main Building, Wing C',
    imgSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC4wWkv0bnYO6h2rigkDZ4SVsRse128PxRHWb5iLOfZAQn3cQCroASpi0yTawZKccsvh0QNS0Ez10vw611w-AdjxnJPegmUJ1mpXIEV9sbOnvUXKy6E6jxwUoi4xR8xurivHmrwG7UOPJDmEsPDzjecjmAuXlcBwpw50xNq7LshpvDkJ0SibLbKts_PmaSmMb8bKPpeVHnVrT9o3iy5L424hC_MrIYVqbCmGia2YgawIH3pHZH3Oru9eXPV0OEPGOq-oepRIF1Tlq5z'
  },
  'Dr. Aryan Sharma': {
    specialty: 'Cardiovascular Medicine',
    location: 'Main Building, Wing A',
    imgSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC4wWkv0bnYO6h2rigkDZ4SVsRse128PxRHWb5iLOfZAQn3cQCroASpi0yTawZKccsvh0QNS0Ez10vw611w-AdjxnJPegmUJ1mpXIEV9sbOnvUXKy6E6jxwUoi4xR8xurivHmrwG7UOPJDmEsPDzjecjmAuXlcBwpw50xNq7LshpvDkJ0SibLbKts_PmaSmMb8bKPpeVHnVrT9o3iy5L424hC_MrIYVqbCmGia2YgawIH3pHZH3Oru9eXPV0OEPGOq-oepRIF1Tlq5z'
  },
  'Dr. Sarah Jenkins': {
    specialty: 'Senior Psychiatry',
    location: 'North Wing, Suite 12',
    imgSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCzwxCp6bYRGjalVd8f6PmAzx96JhhGw7h6-edf4X3ZB6s4T4L60sZ8Q81lixJH_6b7jAZrk9hUIHRzAz3Yvko16V_FO3cTg7BKdUbPErgo98BIfwdz9rdx1wT9LKCCE_NUetWQHWYGg0r_xBHpQYjIR7m2FUzLYVRTEdSEv2hbo9eFwmTp5LQHzsOG3353DaFuTegNDqyNMKFniPcXVOORKwWn8OXSOVysuGSpB5aAzeVPqFj694t_JQVhjMBaBMxNRHBLuprReGVS'
  },
  'Dr. Michael Chang': {
    specialty: 'Neuropsychiatry',
    location: 'North Wing, Suite 14',
    imgSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC4wWkv0bnYO6h2rigkDZ4SVsRse128PxRHWb5iLOfZAQn3cQCroASpi0yTawZKccsvh0QNS0Ez10vw611w-AdjxnJPegmUJ1mpXIEV9sbOnvUXKy6E6jxwUoi4xR8xurivHmrwG7UOPJDmEsPDzjecjmAuXlcBwpw50xNq7LshpvDkJ0SibLbKts_PmaSmMb8bKPpeVHnVrT9o3iy5L424hC_MrIYVqbCmGia2YgawIH3pHZH3Oru9eXPV0OEPGOq-oepRIF1Tlq5z'
  }
};

function renderAppointments(appointments, container, role) {
  if (!appointments || appointments.length === 0) {
    container.innerHTML = '<div class="p-8 text-center text-on-surface-variant">No upcoming appointments found.</div>';
    return;
  }

  container.innerHTML = appointments.map(app => {
    const counterparty = role === 'DOCTOR' ? app.patient : app.doctor;
    const name = escapeHtml(counterparty?.fullName || 'Clinical appointment');
    
    let formattedDate = 'Date pending';
    let formattedTime = '';
    if (app.dateTime) {
      const d = new Date(app.dateTime);
      formattedDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      formattedTime = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    
    const status = escapeHtml(app.status || 'PENDING');
    
    // Look up metadata
    const meta = DOCTOR_METADATA[name] || {
      specialty: 'General Consultation',
      location: 'Main Clinic',
      imgSrc: ''
    };

    const imgTag = meta.imgSrc 
      ? `<img alt="${name}" class="w-12 h-12 rounded-full object-cover" src="${meta.imgSrc}" />`
      : `<div class="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-primary"><span class="material-symbols-outlined">event</span></div>`;

    return `
      <div onclick="const acts = this.querySelector('.hover-actions'); const badge = this.querySelector('.status-badge'); if(acts && badge) { acts.classList.toggle('hidden'); acts.classList.toggle('flex'); badge.classList.toggle('hidden'); }" class="flex items-center justify-between p-4 bg-surface rounded-xl hover:bg-surface-container-low transition-colors group cursor-pointer relative">
        <div class="flex items-center gap-4">
          ${imgTag}
          <div class="min-w-0">
            <p class="text-on-surface font-bold truncate">${name}</p>
            <p class="text-xs text-on-surface-variant">${meta.specialty} ${formattedTime ? '• ' + formattedTime : ''}</p>
          </div>
        </div>
        <div class="text-right flex items-center gap-4">
          <div class="hidden sm:block mr-2">
            <p class="text-sm font-medium text-on-surface">${formattedDate}</p>
            <p class="text-[10px] text-on-surface-variant uppercase tracking-widest">${meta.location}</p>
          </div>
          
          <!-- Status Badge -->
          <span class="status-badge px-3 py-1 group-hover:hidden ${
            status === 'SCHEDULED' || status === 'CONFIRMED'
              ? 'bg-secondary-container text-on-secondary-container' :
            status === 'CANCELLED'
              ? 'bg-error-container text-on-error-container'
              : 'bg-surface-container-highest text-on-surface-variant'
          } text-[11px] font-bold rounded-full uppercase tracking-tighter transition-all duration-200">${status === 'SCHEDULED' ? 'Confirmed' : status}</span>
          
          <!-- Actions Container (displays on hover or toggle click) -->
          <div class="hover-actions hidden group-hover:flex items-center gap-2 transition-all duration-200">
            <button onclick="event.stopPropagation(); window.location.href='appointment-booking.html'" type="button" class="px-3 py-1.5 text-xs bg-primary text-on-primary hover:bg-primary-fixed hover:text-primary rounded-lg font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all">
              <span class="material-symbols-outlined text-[14px]">add</span>
              Book Another
            </button>
            ${status === 'SCHEDULED' ? `
            <button onclick="event.stopPropagation(); cancelAppointment(${app.id})" type="button" class="px-3 py-1.5 text-xs bg-error-container text-on-error-container hover:bg-error hover:text-on-error rounded-lg font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all">
              <span class="material-symbols-outlined text-[14px]">delete</span>
              Cancel
            </button>
            ` : ''}
          </div>
          
          <!-- Chevron Indicator -->
          <span class="material-symbols-outlined text-on-surface-variant opacity-0 group-hover:hidden transition-opacity" data-icon="chevron_right">chevron_right</span>
        </div>
      </div>
    `;
  }).join('');
}

window.cancelAppointment = async function(id) {
  if (!confirm('Are you sure you want to cancel this appointment?')) return;
  try {
    const response = await apiFetch(`/appointments/${id}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      showNotification('Appointment cancelled successfully.', 'success');
      initDashboard();
    } else {
      showNotification('Failed to cancel appointment.', 'error');
    }
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    showNotification('Unable to reach backend to cancel appointment.', 'error');
  }
};

const DOCTOR_DATA = {
  Cardiology: [
    {
      id: 'sangeeta',
      name: 'Dr. Sangeeta Rao',
      title: 'Senior Cardiologist',
      experience: '12y Exp',
      education: 'AIIMS Delhi',
      rating: '4.9',
      imgSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCzwxCp6bYRGjalVd8f6PmAzx96JhhGw7h6-edf4X3ZB6s4T4L60sZ8Q81lixJH_6b7jAZrk9hUIHRzAz3Yvko16V_FO3cTg7BKdUbPErgo98BIfwdz9rdx1wT9LKCCE_NUetWQHWYGg0r_xBHpQYjIR7m2FUzLYVRTEdSEv2hbo9eFwmTp5LQHzsOG3353DaFuTegNDqyNMKFniPcXVOORKwWn8OXSOVysuGSpB5aAzeVPqFj694t_JQVhjMBaBMxNRHBLuprReGVS'
    },
    {
      id: 'rajesh',
      name: 'Dr. Rajesh Iyer',
      title: 'Interventional Cardiology',
      experience: '10y Exp',
      education: 'JIPMER',
      rating: '4.7 (120 reviews)',
      imgSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC4wWkv0bnYO6h2rigkDZ4SVsRse128PxRHWb5iLOfZAQn3cQCroASpi0yTawZKccsvh0QNS0Ez10vw611w-AdjxnJPegmUJ1mpXIEV9sbOnvUXKy6E6jxwUoi4xR8xurivHmrwG7UOPJDmEsPDzjecjmAuXlcBwpw50xNq7LshpvDkJ0SibLbKts_PmaSmMb8bKPpeVHnVrT9o3iy5L424hC_MrIYVqbCmGia2YgawIH3pHZH3Oru9eXPV0OEPGOq-oepRIF1Tlq5z'
    }
  ],
  Psychiatry: [
    {
      id: 'sangeeta',
      name: 'Dr. Sarah Jenkins',
      title: 'Senior Psychiatrist',
      experience: '14y Exp',
      education: 'NIMHANS',
      rating: '4.9',
      imgSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCzwxCp6bYRGjalVd8f6PmAzx96JhhGw7h6-edf4X3ZB6s4T4L60sZ8Q81lixJH_6b7jAZrk9hUIHRzAz3Yvko16V_FO3cTg7BKdUbPErgo98BIfwdz9rdx1wT9LKCCE_NUetWQHWYGg0r_xBHpQYjIR7m2FUzLYVRTEdSEv2hbo9eFwmTp5LQHzsOG3353DaFuTegNDqyNMKFniPcXVOORKwWn8OXSOVysuGSpB5aAzeVPqFj694t_JQVhjMBaBMxNRHBLuprReGVS'
    },
    {
      id: 'rajesh',
      name: 'Dr. Michael Chang',
      title: 'Neuropsychiatrist',
      experience: '8y Exp',
      education: 'KMC Manipal',
      rating: '4.8 (95 reviews)',
      imgSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC4wWkv0bnYO6h2rigkDZ4SVsRse128PxRHWb5iLOfZAQn3cQCroASpi0yTawZKccsvh0QNS0Ez10vw611w-AdjxnJPegmUJ1mpXIEV9sbOnvUXKy6E6jxwUoi4xR8xurivHmrwG7UOPJDmEsPDzjecjmAuXlcBwpw50xNq7LshpvDkJ0SibLbKts_PmaSmMb8bKPpeVHnVrT9o3iy5L424hC_MrIYVqbCmGia2YgawIH3pHZH3Oru9eXPV0OEPGOq-oepRIF1Tlq5z'
    }
  ]
};

function parseTime(timeStr) {
  const match = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return { hours: 10, minutes: 0 };
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
}

function getIsoDateTime(dateStr, timeStr) {
  const monthNames = {
    november: '11', december: '12', january: '01', february: '02',
    march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10'
  };
  const parts = dateStr.replace(',', '').split(/\s+/);
  const month = monthNames[parts[0].toLowerCase()] || '11';
  let day = parts[1];
  if (day.length === 1) day = '0' + day;
  const year = parts[2] || '2024';
  const { hours, minutes } = parseTime(timeStr);
  const hourStr = String(hours).padStart(2, '0');
  const minuteStr = String(minutes).padStart(2, '0');
  return `${year}-${month}-${day}T${hourStr}:${minuteStr}:00`;
}

function updateDoctorsForSpecialty(specialty) {
  const data = DOCTOR_DATA[specialty] || DOCTOR_DATA.Cardiology;
  const sangeetaCard = document.getElementById('doctor-sangeeta');
  if (sangeetaCard) {
    const nameEl = sangeetaCard.querySelector('h4');
    if (nameEl) nameEl.textContent = data[0].name;
    const titleEl = sangeetaCard.querySelector('p');
    if (titleEl) titleEl.textContent = data[0].title;
    const ratingEl = sangeetaCard.querySelector('.absolute.top-4.right-4');
    if (ratingEl) ratingEl.innerHTML = `<span class="material-symbols-outlined text-[12px]" style="font-variation-settings: 'FILL' 1;">star</span> ${data[0].rating}`;
    const badgeContainer = sangeetaCard.querySelector('.flex.gap-2');
    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span class="text-[10px] bg-surface-container-low px-2 py-1 rounded font-medium">${data[0].experience}</span>
        <span class="text-[10px] bg-surface-container-low px-2 py-1 rounded font-medium">${data[0].education}</span>
      `;
    }
  }
  const rajeshCard = document.getElementById('doctor-rajesh');
  if (rajeshCard) {
    const nameEl = rajeshCard.querySelector('h4');
    if (nameEl) nameEl.textContent = data[1].name;
    const titleEl = rajeshCard.querySelector('p');
    if (titleEl) titleEl.textContent = data[1].title;
    const ratingEl = rajeshCard.querySelector('.mt-2');
    if (ratingEl) ratingEl.innerHTML = `<span class="material-symbols-outlined text-[14px]">star</span> ${data[1].rating}`;
  }
}

function initBookingPage() {
  let activeStep = 1;
  const params = new URLSearchParams(window.location.search);
  let selectedSpecialty = params.get('specialty') || '';
  
  // Set calendar initialization dynamically to the current month & year
  const today = new Date();
  const startYear = today.getFullYear();
  const startMonth = today.getMonth(); // 0-indexed (e.g. 5 for June)
  
  // Calculate max allowed month (+2 months from current)
  let maxMonth = startMonth + 2;
  let maxYear = startYear;
  if (maxMonth > 11) {
    maxMonth -= 12;
    maxYear += 1;
  }

  let selectedDoctor = 'Dr. Sangeeta Rao';
  let selectedTime = '10:30 AM';
  let uploadedFile = null;

  // Calendar month/year navigation state
  let currentYear = startYear;
  let currentMonth = startMonth;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Initialize selectedDate dynamically to the current system date
  let selectedDate = `${monthNames[startMonth]} ${today.getDate()}, ${startYear}`;

  function updateSidebarProgress() {
    for (let i = 1; i <= 4; i++) {
      const badge = document.getElementById(`journey-step-${i}-badge`);
      const title = document.getElementById(`journey-step-${i}-title`);
      const sub = document.getElementById(`journey-step-${i}-sub`);
      const line = document.getElementById(`journey-step-${i}-line`);

      if (!badge || !title || !sub) continue;

      badge.className = 'w-8 h-8 rounded-full flex items-center justify-center z-10 transition-all duration-300';
      title.className = 'text-sm font-semibold transition-colors duration-300';
      sub.className = 'text-xs text-on-surface-variant transition-colors duration-300';
      if (line) line.className = 'w-0.5 h-12 transition-colors duration-300';

      if (i === activeStep) {
        badge.classList.add('bg-primary', 'text-on-primary', 'shadow-lg', 'ring-4', 'ring-primary-fixed');
        badge.innerHTML = `<span class="text-sm font-bold">${i}</span>`;
        title.classList.add('text-primary');
        sub.textContent = 'Selection in progress...';
        if (line) line.classList.add('bg-outline-variant');
      } else if (i < activeStep) {
        badge.classList.add('bg-secondary', 'text-on-secondary');
        badge.innerHTML = '<span class="material-symbols-outlined text-sm">check</span>';
        title.classList.add('text-on-surface');
        if (line) line.classList.add('bg-secondary');

        const isPredecessor = (i === activeStep - 1);
        if (isPredecessor) {
          if (i === 1) {
            sub.textContent = selectedSpecialty;
          } else if (i === 2) {
            sub.textContent = `${selectedDoctor.split(' ').pop()} • ${selectedDate.split(',')[0]} ${selectedTime}`;
          } else if (i === 3) {
            sub.textContent = uploadedFile ? `Doc: ${uploadedFile.name.slice(0, 15)}...` : 'Intake details saved';
          }
        } else {
          sub.textContent = 'Completed';
        }
      } else {
        badge.classList.add('bg-surface-container-highest', 'text-on-surface-variant');
        badge.innerHTML = `<span class="text-sm font-bold">${i}</span>`;
        title.classList.add('text-on-surface-variant');
        sub.textContent = 'Pending';
        if (line) line.classList.add('bg-outline-variant');
      }
    }
  }

  function compileReviewDetails() {
    const reviewSpecialty = document.getElementById('review-specialty');
    const reviewDoctor = document.getElementById('review-doctor');
    const reviewDatetime = document.getElementById('review-datetime');
    const reviewReason = document.getElementById('review-reason');
    const reviewFilename = document.getElementById('review-filename');

    if (reviewSpecialty) reviewSpecialty.textContent = selectedSpecialty;
    if (reviewDoctor) reviewDoctor.textContent = selectedDoctor;
    if (reviewDatetime) reviewDatetime.textContent = `${selectedDate} at ${selectedTime}`;
    if (reviewReason) {
      const reasonText = document.getElementById('booking-reason')?.value.trim();
      reviewReason.textContent = reasonText ? `"${reasonText}"` : 'No clinical details provided';
    }
    if (reviewFilename) {
      if (uploadedFile) {
        reviewFilename.textContent = `${uploadedFile.name} (${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB)`;
      } else {
        reviewFilename.textContent = 'No files attached';
      }
    }
  }

  function goToStep(step) {
    if (step === 2 && !selectedSpecialty) {
      showNotification('Please select a specialty first.', 'error');
      return;
    }
    if (step === 3 && activeStep < 2) {
      showNotification('Please complete the schedule selection first.', 'error');
      return;
    }
    if (step === 4) {
      if (activeStep < 3) {
        showNotification('Please complete intake details first.', 'error');
        return;
      }
      compileReviewDetails();
    }

    activeStep = step;

    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById(`step-${i}-container`);
      if (el) {
        if (i === step) el.classList.remove('hidden');
        else el.classList.add('hidden');
      }
    }

    updateSidebarProgress();
  }

  function renderCalendar(year, month) {
    const headerTitle = document.getElementById('calendar-header-title');
    if (headerTitle) {
      headerTitle.textContent = `${monthNames[month]} ${year}`;
    }

    const grid = document.getElementById('calendar-grid');
    if (!grid) return;

    // Constrain Month Navigation Buttons style & responsiveness
    const canGoPrev = (year > startYear) || (year === startYear && month > startMonth);
    const canGoNext = (year < maxYear) || (year === maxYear && month < maxMonth);

    const prevBtn = document.getElementById('btn-prev-month');
    const nextBtn = document.getElementById('btn-next-month');

    if (prevBtn) {
      prevBtn.disabled = !canGoPrev;
      prevBtn.style.opacity = canGoPrev ? '1' : '0.3';
      prevBtn.style.cursor = canGoPrev ? 'pointer' : 'not-allowed';
    }
    if (nextBtn) {
      nextBtn.disabled = !canGoNext;
      nextBtn.style.opacity = canGoNext ? '1' : '0.3';
      nextBtn.style.cursor = canGoNext ? 'pointer' : 'not-allowed';
    }

    // Clear day cells safely (keep first 7 children, which are day week headers: S M T W T F S)
    while (grid.children.length > 7) {
      grid.removeChild(grid.lastChild);
    }

    const firstDayIndex = new Date(year, month, 1).getDay();
    const numDays = new Date(year, month + 1, 0).getDate();
    const prevMonthNumDays = new Date(year, month, 0).getDate();

    // Render trailing days of previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = prevMonthNumDays - i;
      const cell = document.createElement('div');
      cell.className = 'p-2 text-xs text-outline-variant';
      cell.textContent = day;
      grid.appendChild(cell);
    }

    // Render days of active month
    for (let day = 1; day <= numDays; day++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      
      const dateToCheck = `${monthNames[month]} ${day}, ${year}`;
      const isSelected = (dateToCheck === selectedDate);

      if (isSelected) {
        btn.className = 'p-2 text-xs font-bold bg-primary text-on-primary rounded-xl ring-2 ring-primary-fixed';
      } else {
        btn.className = 'p-2 text-xs font-semibold hover:bg-primary-fixed rounded-lg';
      }
      
      btn.textContent = day;
      btn.addEventListener('click', () => {
        grid.querySelectorAll('button').forEach(b => {
          b.className = 'p-2 text-xs font-semibold hover:bg-primary-fixed rounded-lg';
        });
        btn.className = 'p-2 text-xs font-bold bg-primary text-on-primary rounded-xl ring-2 ring-primary-fixed';
        selectedDate = `${monthNames[month]} ${day}, ${year}`;
      });

      grid.appendChild(btn);
    }
  }

  // Month navigation click bindings with bounds enforcement
  document.getElementById('btn-prev-month')?.addEventListener('click', () => {
    const canGoPrev = (currentYear > startYear) || (currentYear === startYear && currentMonth > startMonth);
    if (!canGoPrev) return;
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar(currentYear, currentMonth);
  });

  document.getElementById('btn-next-month')?.addEventListener('click', () => {
    const canGoNext = (currentYear < maxYear) || (currentYear === maxYear && currentMonth < maxMonth);
    if (!canGoNext) return;
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar(currentYear, currentMonth);
  });

  // Step 1: Specialty Selection Card bindings
  const cardiologyCard = document.getElementById('specialty-card-cardiology');
  const psychiatryCard = document.getElementById('specialty-card-psychiatry');

  function highlightSpecialtyCard(specialty) {
    [cardiologyCard, psychiatryCard].forEach(c => {
      if (!c) return;
      c.classList.remove('ring-2', 'ring-primary', 'bg-primary-fixed/10');
      c.classList.add('border-transparent');
    });
    const activeCard = specialty === 'Cardiology' ? cardiologyCard : psychiatryCard;
    if (activeCard) {
      activeCard.classList.remove('border-transparent');
      activeCard.classList.add('ring-2', 'ring-primary', 'bg-primary-fixed/10');
    }
  }

  if (cardiologyCard) {
    cardiologyCard.addEventListener('click', () => {
      selectedSpecialty = 'Cardiology';
      highlightSpecialtyCard('Cardiology');
      updateDoctorsForSpecialty('Cardiology');
      selectedDoctor = DOCTOR_DATA.Cardiology[0].name;
      setTimeout(() => goToStep(2), 250);
    });
  }

  if (psychiatryCard) {
    psychiatryCard.addEventListener('click', () => {
      selectedSpecialty = 'Psychiatry';
      highlightSpecialtyCard('Psychiatry');
      updateDoctorsForSpecialty('Psychiatry');
      selectedDoctor = DOCTOR_DATA.Psychiatry[0].name;
      setTimeout(() => goToStep(2), 250);
    });
  }

  // Step 2: Doctor click bindings
  const doctorCards = document.querySelectorAll('.doctor-card');
  doctorCards.forEach(card => {
    card.addEventListener('click', () => {
      doctorCards.forEach(c => {
        c.classList.remove('ring-2', 'ring-primary', 'bg-surface-container-lowest');
        c.classList.add('bg-white/40', 'hover:bg-white');
        const nameEl = c.querySelector('h4');
        if (nameEl) {
          nameEl.classList.remove('text-on-surface');
          nameEl.classList.add('text-on-surface-variant');
        }
      });
      card.classList.remove('bg-white/40', 'hover:bg-white');
      card.classList.add('ring-2', 'ring-primary', 'bg-surface-container-lowest');
      const activeNameEl = card.querySelector('h4');
      if (activeNameEl) {
        activeNameEl.classList.remove('text-on-surface-variant');
        activeNameEl.classList.add('text-on-surface');
      }
      const isRajesh = card.id === 'doctor-rajesh';
      selectedDoctor = DOCTOR_DATA[selectedSpecialty] ? DOCTOR_DATA[selectedSpecialty][isRajesh ? 1 : 0].name : (isRajesh ? 'Dr. Rajesh Iyer' : 'Dr. Sangeeta Rao');
    });
  });

  // Step 2: Time slot selection
  const timeSlotButtons = document.querySelectorAll('#time-slots-grid button:not(.cursor-not-allowed)');
  timeSlotButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      timeSlotButtons.forEach(b => {
        b.className = 'py-3 px-4 rounded-xl border border-outline-variant hover:border-primary hover:text-primary transition-all text-sm font-medium';
      });
      btn.className = 'py-3 px-4 rounded-xl bg-primary-fixed text-primary border-2 border-primary font-bold text-sm';
      selectedTime = btn.textContent.trim();
    });
  });

  // Step 3: Document upload dropzone logic
  const dropzone = document.getElementById('booking-dropzone');
  const fileInput = document.getElementById('booking-file-input');
  const uploadDetails = document.getElementById('upload-details');
  const uploadFilename = document.getElementById('upload-filename');
  const uploadFilesize = document.getElementById('upload-filesize');
  const removeFileBtn = document.getElementById('btn-remove-file');

  function handleFileSelection(file) {
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    const fileExt = file.name.split('.').pop().toLowerCase();
    const isAllowedExt = ['pdf', 'jpg', 'jpeg', 'png'].includes(fileExt);

    if (!allowedTypes.includes(file.type) && !isAllowedExt) {
      showNotification('Invalid file type. Only PDF, JPG, and PNG are allowed.', 'error');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      showNotification('File exceeds the 10MB limit.', 'error');
      return;
    }

    uploadedFile = file;

    if (uploadFilename) uploadFilename.textContent = file.name;
    if (uploadFilesize) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      uploadFilesize.textContent = `${sizeMb} MB`;
    }
    
    if (dropzone) dropzone.classList.add('hidden');
    if (uploadDetails) uploadDetails.classList.remove('hidden');
    
    showNotification('Document uploaded successfully!', 'success');
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      handleFileSelection(file);
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-primary', 'bg-primary/5');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-primary', 'bg-primary/5');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-primary', 'bg-primary/5');
      const file = e.dataTransfer.files[0];
      handleFileSelection(file);
    });
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      uploadedFile = null;
      if (fileInput) fileInput.value = '';
      
      if (dropzone) dropzone.classList.remove('hidden');
      if (uploadDetails) uploadDetails.classList.add('hidden');
      
      showNotification('Document removed.', 'info');
    });
  }

  // Navigation button handlers
  document.getElementById('btn-step1-continue')?.addEventListener('click', () => goToStep(2));
  document.getElementById('btn-step2-continue')?.addEventListener('click', () => goToStep(3));
  document.getElementById('btn-step3-continue')?.addEventListener('click', () => goToStep(4));

  document.getElementById('btn-step2-back')?.addEventListener('click', () => goToStep(1));
  document.getElementById('btn-step3-back')?.addEventListener('click', () => goToStep(2));
  document.getElementById('btn-step4-back')?.addEventListener('click', () => goToStep(3));

  // Restrict forward step clicks in the sidebar
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`journey-step-${i}`)?.addEventListener('click', () => {
      if (i > activeStep) {
        showNotification('Please complete the current step first.', 'error');
        return;
      }
      goToStep(i);
    });
  }

  const saveDraftBtn = document.getElementById('btn-save-draft');
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', () => {
      showNotification('Draft saved successfully!', 'success');
    });
  }
  
  const viewDashboardBtn = document.getElementById('btn-view-dashboard');
  if (viewDashboardBtn) {
    viewDashboardBtn.addEventListener('click', () => {
      window.location.href = 'patient-dashboard.html';
    });
  }

  const addCalendarBtn = document.getElementById('btn-add-calendar');
  if (addCalendarBtn) {
    addCalendarBtn.addEventListener('click', () => {
      showNotification('Added to calendar!', 'success');
    });
  }
  
  // Submit Booking (Continue to Review on Step 4)
  const confirmBookingBtn = document.getElementById('btn-continue-review');
  if (confirmBookingBtn) {
    confirmBookingBtn.addEventListener('click', async () => {
      const reasonVal = document.getElementById('booking-reason')?.value.trim() || '';
      
      const payload = {
        doctor: {
          id: 2
        },
        dateTime: getIsoDateTime(selectedDate, selectedTime),
        status: 'SCHEDULED',
        reason: reasonVal || 'Regular Consultation'
      };
      
      const originalText = confirmBookingBtn.innerHTML;
      confirmBookingBtn.disabled = true;
      confirmBookingBtn.innerHTML = 'Booking...';
      
      try {
        const response = await apiFetch('/appointments', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {
          const successText = document.getElementById('booking-success-text');
          if (successText) {
            successText.textContent = `Your appointment with ${selectedDoctor} is secured for ${selectedDate} at ${selectedTime}.`;
          }
          const modal = document.getElementById('booking-success-modal');
          if (modal) {
            modal.classList.remove('hidden');
          }
          showNotification('Appointment booked successfully!', 'success');
        } else {
          const errData = await response.json().catch(() => ({}));
          showNotification(errData.message || 'Failed to book appointment.', 'error');
        }
      } catch (error) {
        console.error('Booking error:', error);
        showNotification('Unable to reach backend to save the appointment.', 'error');
      } finally {
        confirmBookingBtn.disabled = false;
        confirmBookingBtn.innerHTML = originalText;
      }
    });
  }

  // Initialize view
  renderCalendar(currentYear, currentMonth);
  if (selectedSpecialty) {
    highlightSpecialtyCard(selectedSpecialty);
    updateDoctorsForSpecialty(selectedSpecialty);
    selectedDoctor = DOCTOR_DATA[selectedSpecialty] ? DOCTOR_DATA[selectedSpecialty][0].name : 'Dr. Sangeeta Rao';
    goToStep(2);
  } else {
    goToStep(1);
  }
}

function initProfilePage() {
  const session = getStoredSession();
  if (!session) return;
  const role = session.role;
  const email = session.email || '';

  let defaultName = 'Ananya Kulkarni';
  let defaultEmail = email || 'ananya@medcloudclinic.com';
  let defaultPhone = '+91 98765 43212';
  let defaultBio = 'Active patient at MedCloud Clinic since 2021.';
  let medicalId = 'PT-108-92';
  let imgSrc = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCrA1twh9WaIPDXz5if4fvtNZZ1WM3mS-UJFxcmSrd_t33V-l46nSkajC-HzvqQyPyQ6OBwIByKQ8J42_Cam-vdf3p_kiiUUgTc5d2OqNcqsMxwkd4l4k7FVZNejCOxrZhYRciVOt1T8tv8ddVQGLH7Vsbbu4DYHBKkKeDn5U4ibsr7X-MVwt6SYYXFQ4UfS-XSaHWmg3MALBIYRv6ED1CiMvRV40-pBErfCL0to8muoHNaldYZ4iOH5nm2eIcRhSRCToySU9I0_FO5';

  if (role === 'ADMIN') {
    defaultName = 'Saaket Baldawa';
    defaultEmail = email || 'saaket@medcloudclinic.com';
    defaultPhone = '+91 98765 43210';
    defaultBio = 'Board-certified Senior Clinician with over 12 years of experience in internal medicine. Specialized in personalized patient care and clinical data analysis at MedCloud Clinic.';
    medicalId = 'MD-992-04';
  } else if (role === 'DOCTOR') {
    defaultName = 'Dr. Aryan Sharma';
    defaultEmail = email || 'aryan@medcloudclinic.com';
    defaultPhone = '+91 98765 43211';
    defaultBio = 'Senior Cardiologist with extensive clinical research experience.';
    medicalId = 'DR-442-12';
    imgSrc = 'https://lh3.googleusercontent.com/aida-public/AB6AXuC4wWkv0bnYO6h2rigkDZ4SVsRse128PxRHWb5iLOfZAQn3cQCroASpi0yTawZKccsvh0QNS0Ez10vw611w-AdjxnJPegmUJ1mpXIEV9sbOnvUXKy6E6jxwUoi4xR8xurivHmrwG7UOPJDmEsPDzjecjmAuXlcBwpw50xNq7LshpvDkJ0SibLbKts_PmaSmMb8bKPpeVHnVrT9o3iy5L424hC_MrIYVqbCmGia2YgawIH3pHZH3Oru9eXPV0OEPGOq-oepRIF1Tlq5z';
  }

  const profileKey = `medcloud_profile_${email}`;
  const savedProfile = localStorage.getItem(profileKey) ? JSON.parse(localStorage.getItem(profileKey)) : null;

  const profileNameInput = document.getElementById('profile-name');
  const profileMedicalIdInput = document.getElementById('profile-medical-id');
  const profileEmailInput = document.getElementById('profile-email');
  const profilePhoneInput = document.getElementById('profile-phone');
  const profileBioInput = document.getElementById('profile-bio');
  const profileImg = document.querySelector('main img');

  if (profileNameInput) profileNameInput.value = savedProfile?.name || defaultName;
  if (profileMedicalIdInput) profileMedicalIdInput.value = medicalId;
  if (profileEmailInput) profileEmailInput.value = savedProfile?.email || defaultEmail;
  if (profilePhoneInput) profilePhoneInput.value = savedProfile?.phone || defaultPhone;
  if (profileBioInput) profileBioInput.value = savedProfile?.bio || defaultBio;
  if (profileImg && role !== 'ADMIN') {
    profileImg.src = imgSrc;
    profileImg.alt = savedProfile?.name || defaultName;
  }

  const saveBtn = document.getElementById('btn-save-profile');
  const discardBtn = document.getElementById('btn-discard-profile');

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const name = profileNameInput?.value.trim();
      const userEmail = profileEmailInput?.value.trim();
      const phone = profilePhoneInput?.value.trim();
      const bio = profileBioInput?.value.trim();

      if (!name || !userEmail) {
        showNotification('Name and Email are required.', 'error');
        return;
      }

      const updatedProfile = { name, email: userEmail, phone, bio };
      localStorage.setItem(profileKey, JSON.stringify(updatedProfile));
      
      const userNameElement = document.getElementById('user-name');
      if (userNameElement) {
        userNameElement.textContent = name;
      }
      
      showNotification('Profile updated successfully!', 'success');
    });
  }

  if (discardBtn) {
    discardBtn.addEventListener('click', () => {
      if (profileNameInput) profileNameInput.value = savedProfile?.name || defaultName;
      if (profileEmailInput) profileEmailInput.value = savedProfile?.email || defaultEmail;
      if (profilePhoneInput) profilePhoneInput.value = savedProfile?.phone || defaultPhone;
      if (profileBioInput) profileBioInput.value = savedProfile?.bio || defaultBio;
      showNotification('Changes discarded.', 'info');
    });
  }
}

function initDoctorDashboard() {
  const newPrescriptionBtn = document.getElementById('btn-new-prescription');
  const prescriptionModal = document.getElementById('prescription-modal');
  const closePrescriptionBtn = document.getElementById('btn-close-prescription');
  const cancelPrescriptionBtn = document.getElementById('btn-cancel-prescription');
  const prescriptionForm = document.getElementById('prescription-form');

  if (newPrescriptionBtn && prescriptionModal) {
    newPrescriptionBtn.addEventListener('click', () => {
      prescriptionModal.classList.remove('hidden');
    });
  }

  function hidePrescriptionModal() {
    if (prescriptionModal) {
      prescriptionModal.classList.add('hidden');
    }
    if (prescriptionForm) {
      prescriptionForm.reset();
    }
  }

  if (closePrescriptionBtn) {
    closePrescriptionBtn.addEventListener('click', hidePrescriptionModal);
  }

  if (cancelPrescriptionBtn) {
    cancelPrescriptionBtn.addEventListener('click', hidePrescriptionModal);
  }

  if (prescriptionModal) {
    prescriptionModal.addEventListener('click', (e) => {
      if (e.target === prescriptionModal) {
        hidePrescriptionModal();
      }
    });
  }

  if (prescriptionForm) {
    prescriptionForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const medication = document.getElementById('prescription-medication')?.value.trim();
      const dosage = document.getElementById('prescription-dosage')?.value.trim();
      const duration = document.getElementById('prescription-duration')?.value.trim();
      const frequency = document.getElementById('prescription-frequency')?.value;

      if (!medication || !dosage || !duration || !frequency) {
        showNotification('Please fill in all required fields.', 'error');
        return;
      }

      // Decrement "Pending Prescriptions" count
      const pendingCountEl = document.getElementById('pending-prescriptions-count');
      if (pendingCountEl) {
        let currentCount = parseInt(pendingCountEl.textContent, 10);
        if (!isNaN(currentCount) && currentCount > 0) {
          pendingCountEl.textContent = String(currentCount - 1).padStart(2, '0');
        }
      }

      hidePrescriptionModal();
      showNotification(`Prescription for ${medication} successfully issued for Asha Devi!`, 'success');
    });
  }

  // 1. Search Bar Logic
  const searchInput = document.getElementById('doctor-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('table tbody tr');
      let visibleCount = 0;

      rows.forEach(row => {
        if (row.id === 'no-results-row') return;
        const text = row.textContent.toLowerCase();
        if (text.includes(query)) {
          row.style.display = '';
          visibleCount++;
        } else {
          row.style.display = 'none';
        }
      });

      let noResultsRow = document.getElementById('no-results-row');
      if (visibleCount === 0) {
        if (!noResultsRow) {
          noResultsRow = document.createElement('tr');
          noResultsRow.id = 'no-results-row';
          noResultsRow.innerHTML = `
            <td colspan="5" class="px-6 py-8 text-center text-slate-500 font-medium font-manrope text-sm">
              <span class="material-symbols-outlined text-4xl block mb-2 text-slate-300">search_off</span>
              No patients, records, or diagnostics found matching "${escapeHtml(query)}"
            </td>
          `;
          document.querySelector('table tbody').appendChild(noResultsRow);
        } else {
          noResultsRow.querySelector('td').innerHTML = `
            <span class="material-symbols-outlined text-4xl block mb-2 text-slate-300">search_off</span>
            No patients, records, or diagnostics found matching "${escapeHtml(query)}"
          `;
          noResultsRow.style.display = '';
        }
      } else if (noResultsRow) {
        noResultsRow.style.display = 'none';
      }
    });
  }

  // 2. Notifications Dropdown Logic
  const notificationsBtn = document.getElementById('btn-notifications');
  const notificationsDropdown = document.getElementById('notifications-dropdown');
  const clearNotificationsBtn = document.getElementById('btn-clear-notifications');
  const notificationBadge = document.getElementById('notification-badge');
  const notificationsListContainer = document.getElementById('notifications-list-container');

  if (notificationsBtn && notificationsDropdown) {
    notificationsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notificationsDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!notificationsDropdown.classList.contains('hidden') && !notificationsDropdown.contains(e.target) && e.target !== notificationsBtn) {
        notificationsDropdown.classList.add('hidden');
      }
    });
  }

  if (clearNotificationsBtn) {
    clearNotificationsBtn.addEventListener('click', () => {
      if (notificationBadge) {
        notificationBadge.classList.add('hidden');
      }
      if (notificationsListContainer) {
        notificationsListContainer.innerHTML = `
          <div class="text-center py-6 text-slate-400 font-manrope">
            <span class="material-symbols-outlined text-3xl mb-1 text-slate-300 block">notifications_off</span>
            No notifications
          </div>
        `;
      }
      showNotification('Notifications cleared.', 'info');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  normalizeNavigation();
  updateUnauthorizedNotice();

  const loginForm = document.getElementById('login-form') || document.querySelector('form[onsubmit="handleLogin(event)"]');
  if (loginForm) {
    loginForm.removeAttribute('onsubmit');
    loginForm.addEventListener('submit', handleLogin);
  }

  document.querySelectorAll('.role-btn').forEach(btn => {
    const role = btn.id.replace('btn-', '');
    btn.removeAttribute('onclick');
    btn.addEventListener('click', () => selectRole(role));
  });

  const selectedRole = document.getElementById('selectedRole')?.value || 'PATIENT';
  if (document.getElementById('role-selector')) {
    selectRole(selectedRole);
  }

  const passwordInput = document.getElementById('password');
  const passwordToggle = document.getElementById('password-toggle');
  if (passwordInput && passwordToggle) {
    const passwordIcon = passwordToggle.querySelector('.material-symbols-outlined');
    passwordToggle.addEventListener('click', () => {
      const isPasswordHidden = passwordInput.type === 'password';
      passwordInput.type = isPasswordHidden ? 'text' : 'password';
      passwordToggle.setAttribute('aria-label', isPasswordHidden ? 'Hide password' : 'Show password');
      if (passwordIcon) passwordIcon.textContent = isPasswordHidden ? 'visibility_off' : 'visibility';
    });
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('a, button');
    if (!target) return;

    const label = target.textContent || '';
    if (target.id === 'logout-btn' || /logout/i.test(label)) {
      handleLogout(event);
    }
  });

  const newAppointmentBtn = document.getElementById('new-appointment-btn');
  if (newAppointmentBtn) {
    newAppointmentBtn.addEventListener('click', () => {
      window.location.href = 'appointment-booking.html';
    });
  }

  if (document.getElementById('user-name')) {
    initDashboard();
  }

  const currentPage = getCurrentPage();
  if (currentPage === 'edit-profile.html') {
    initProfilePage();
  } else if (currentPage === 'appointment-booking.html') {
    initBookingPage();
  } else if (currentPage === 'doctor-dashboard.html') {
    initDoctorDashboard();
  }

  const cardiologyWidget = document.getElementById('widget-cardiology');
  if (cardiologyWidget) {
    cardiologyWidget.addEventListener('click', () => {
      window.location.href = 'appointment-booking.html?specialty=Cardiology';
    });
  }
  const psychiatryWidget = document.getElementById('widget-psychiatry');
  if (psychiatryWidget) {
    psychiatryWidget.addEventListener('click', () => {
      window.location.href = 'appointment-booking.html?specialty=Psychiatry';
    });
  }

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('expired')) {
    showNotification('Your session has expired. Please login again.', 'error');
    window.history.replaceState({}, document.title, getCurrentPage());
  }
});

window.addEventListener('pageshow', event => {
  if (event.persisted) {
    checkAuth();
  }
});

window.handleLogin = handleLogin;
window.selectRole = selectRole;
window.handleLogout = handleLogout;
