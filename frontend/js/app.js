// Central application logic to connect to the backend

const API_BASE_URL = 'http://localhost:8080/api/v1';

const DASHBOARD_BY_ROLE = {
  ADMIN: 'admin-dashboard.html',
  DOCTOR: 'doctor-dashboard.html',
  PATIENT: 'patient-dashboard.html'
};

/**
 * Common fetch wrapper to include Authorization header
 */
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('medcloud_token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    // Session expired or unauthorized
    localStorage.removeItem('medcloud_token');
    localStorage.removeItem('medcloud_role');
    if (!window.location.pathname.endsWith('login.html')) {
        window.location.href = 'login.html?expired=true';
    }
  }

  return response;
}

/**
 * Show a simple notification toast (or alert for now)
 */
function showNotification(message, type = 'info') {
    // In a real app, this would be a nice toast. For now, alert or a simple div.
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 p-4 rounded-xl shadow-lg z-50 transition-all duration-300 transform translate-y-10 opacity-0 ${
        type === 'error' ? 'bg-error-container text-on-error-container' : 
        type === 'success' ? 'bg-primary-container text-on-primary-container' : 
        'bg-secondary-container text-on-secondary-container'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    }, 10);

    // Remove after 3s
    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function redirectToDashboard(role) {
  window.location.href = DASHBOARD_BY_ROLE[role] || 'patient-dashboard.html';
}

function selectRole(role) {
  const selectedRoleInput = document.getElementById('selectedRole');
  if (selectedRoleInput) {
    selectedRoleInput.value = role;
  }

  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.classList.remove('border-primary', 'bg-primary-fixed/30', 'text-primary');
    btn.classList.add('border-transparent', 'bg-surface-container-low', 'text-on-surface-variant');
  });

  const activeBtn = document.getElementById('btn-' + role.toLowerCase());
  if (activeBtn) {
    activeBtn.classList.remove('border-transparent', 'bg-surface-container-low', 'text-on-surface-variant');
    activeBtn.classList.add('border-primary', 'bg-primary-fixed/30', 'text-primary');
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('email')?.value.trim().toLowerCase();
  const password = document.getElementById('password')?.value;
  const selectedRole = document.getElementById('selectedRole')?.value.toUpperCase();
  const submitBtn = event.target.querySelector('button[type="submit"]');

  if (!email || !password) {
    showNotification('Both fields are required.', 'error');
    return;
  }

  // Loading state
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="animate-spin mr-2">⏳</span> Authenticating...';

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      if (selectedRole && data.role !== selectedRole) {
        showNotification(`Selected role does not match user account (${data.role}).`, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        return;
      }

      showNotification('Login successful! Redirecting...', 'success');
      localStorage.setItem('medcloud_token', data.token);
      localStorage.setItem('medcloud_role', data.role);
      setTimeout(() => redirectToDashboard(data.role), 500);
    } else {
        showNotification(data.error || 'Login failed. Please check your credentials.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
  } catch (error) {
    console.error('Login error:', error);
    showNotification('Backend service is currently unavailable.', 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
}

// Auth Guard
function checkAuth() {
    const token = localStorage.getItem('medcloud_token');
    const role = localStorage.getItem('medcloud_role');
    const path = window.location.pathname;

    // Public pages
    if (path.endsWith('login.html') || path.endsWith('index.html') || path === '/' || path === '') {
        if (token && path.endsWith('login.html')) {
            redirectToDashboard(role);
        }
        return;
    }

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Role-based access control (simple check)
    if (path.includes('admin') && role !== 'ADMIN') window.location.href = 'index.html';
    if (path.includes('doctor') && role !== 'DOCTOR' && role !== 'ADMIN') window.location.href = 'index.html';
}

// Initialize listeners
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Login Form
    const loginForm = document.querySelector('form[onsubmit="handleLogin(event)"]');
    if (loginForm) {
        loginForm.removeAttribute('onsubmit');
        loginForm.addEventListener('submit', handleLogin);
    }

    // Role buttons
    document.querySelectorAll('.role-btn').forEach(btn => {
        const role = btn.id.replace('btn-', '');
        btn.removeAttribute('onclick');
        btn.addEventListener('click', () => selectRole(role));
    });

    // Password Toggle
    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('password-toggle');
    if (passwordInput && passwordToggle) {
        const passwordIcon = passwordToggle.querySelector('.material-symbols-outlined');
        passwordToggle.addEventListener('click', function () {
            const isPasswordHidden = passwordInput.type === 'password';
            passwordInput.type = isPasswordHidden ? 'text' : 'password';
            passwordToggle.setAttribute('aria-label', isPasswordHidden ? 'Hide password' : 'Show password');
            passwordIcon.textContent = isPasswordHidden ? 'visibility_off' : 'visibility';
        });
    }

    // Logout Button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('medcloud_token');
            localStorage.removeItem('medcloud_role');
            window.location.href = 'login.html';
        });
    }

    // New Appointment Button
    const newAppointmentBtn = document.getElementById('new-appointment-btn');
    if (newAppointmentBtn) {
        newAppointmentBtn.addEventListener('click', () => {
            window.location.href = 'appointment-booking.html';
        });
    }

    // Dashboard Init
    if (document.getElementById('user-name')) {
        initDashboard();
    }

    // Check for expired session param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('expired')) {
        showNotification('Your session has expired. Please login again.', 'error');
    }
});

async function initDashboard() {
    const role = localStorage.getItem('medcloud_role');
    const userNameElement = document.getElementById('user-name');
    const userRoleElement = document.getElementById('user-role');
    
    // Set names based on role with Indian names and specifically Saaket Baldawa for Admin
    if (userNameElement) {
        if (role === 'ADMIN') {
            userNameElement.textContent = "Saaket Baldawa";
        } else if (role === 'DOCTOR') {
            userNameElement.textContent = "Dr. Aryan Sharma";
        } else {
            userNameElement.textContent = "Arjun Mehta";
        }
    }
    if (userRoleElement) userRoleElement.textContent = role + " Access";

    // Load Appointments
    const appointmentsContainer = document.getElementById('appointments-list');
    if (appointmentsContainer) {
        appointmentsContainer.innerHTML = '<div class="p-8 text-center text-on-surface-variant">Loading appointments...</div>';
        try {
            const response = await apiFetch('/appointments/my');
            if (response.ok) {
                const appointments = await response.json();
                renderAppointments(appointments, appointmentsContainer);
            } else {
                appointmentsContainer.innerHTML = '<div class="p-8 text-center text-error">Failed to load appointments.</div>';
            }
        } catch (error) {
            console.error('Error loading appointments:', error);
            appointmentsContainer.innerHTML = '<div class="p-8 text-center text-error">Backend unavailable. Showing offline mode.</div>';
        }
    }
}

function renderAppointments(appointments, container) {
    if (!appointments || appointments.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-on-surface-variant">No upcoming appointments found.</div>';
        return;
    }

    container.innerHTML = appointments.map(app => `
        <div class="flex items-center justify-between p-4 bg-surface rounded-xl hover:bg-surface-container-low transition-colors group">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-primary">
                    <span class="material-symbols-outlined">event</span>
                </div>
                <div>
                    <p class="text-on-surface font-bold">${app.doctor.fullName}</p>
                    <p class="text-xs text-on-surface-variant">${new Date(app.dateTime).toLocaleString()}</p>
                </div>
            </div>
            <div class="text-right flex items-center gap-6">
                <span class="px-3 py-1 ${app.status === 'SCHEDULED' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-highest text-on-surface-variant'} text-[11px] font-bold rounded-full uppercase tracking-tighter">${app.status}</span>
                <span class="material-symbols-outlined text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">chevron_right</span>
            </div>
        </div>
    `).join('');
}

// Expose functions globally for legacy support if needed (though we're moving away)
window.handleLogin = handleLogin;
window.selectRole = selectRole;
