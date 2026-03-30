import { getUser, clearToken, credit } from './api.js';
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderEditor } from './pages/editor.js';
import { renderAdmin } from './pages/admin.js';
import { renderCredits } from './pages/credits.js';

const app = document.getElementById('app');

// Simple hash router
function getRoute() {
  const hash = window.location.hash.slice(1) || '/';
  // Remove query params for route matching
  return hash.split('?')[0];
}

function navigate(path) {
  window.location.hash = path;
}

// Navbar with credit balance
function renderNavbar(user, credits) {
  return `
    <nav class="navbar">
      <div class="navbar-brand" id="nav-home">
        <span class="brand-icon">✦</span>
        IllustConverter
      </div>
      <div class="navbar-actions">
        <button class="btn btn-sm btn-secondary" id="nav-credits" style="gap:0.35rem;">
          💎 <span id="nav-credit-count">${credits ?? '...'}</span>
        </button>
        <div class="navbar-user">
          <span>${escapeHtml(user.username)}</span>
          ${user.is_admin ? '<span class="badge-admin">ADMIN</span>' : ''}
        </div>
        ${user.is_admin ? '<button class="btn btn-sm btn-secondary" id="nav-admin">⚙️ 管理</button>' : ''}
        <button class="btn btn-sm btn-secondary" id="nav-dashboard">🏠 ホーム</button>
        <button class="btn btn-sm btn-danger" id="nav-logout">ログアウト</button>
      </div>
    </nav>
  `;
}

function setupNavbar(user) {
  document.getElementById('nav-home')?.addEventListener('click', () => navigate('/dashboard'));
  document.getElementById('nav-dashboard')?.addEventListener('click', () => navigate('/dashboard'));
  document.getElementById('nav-admin')?.addEventListener('click', () => navigate('/admin'));
  document.getElementById('nav-credits')?.addEventListener('click', () => navigate('/credits'));
  document.getElementById('nav-logout')?.addEventListener('click', () => {
    clearToken();
    navigate('/login');
  });
}

// Load credit balance for navbar
async function loadNavCredits() {
  try {
    const data = await credit.getBalance();
    const el = document.getElementById('nav-credit-count');
    if (el) el.textContent = data.credits;
    return data.credits;
  } catch {
    return 0;
  }
}

// Router
async function router() {
  const route = getRoute();
  const user = getUser();

  // Not logged in -> show login
  if (!user && route !== '/login') {
    navigate('/login');
    return;
  }

  if (route === '/login' || route === '/') {
    if (user) {
      navigate('/dashboard');
      return;
    }
    renderLogin(app, (loggedInUser) => {
      navigate('/dashboard');
    });
    return;
  }

  // Logged in routes
  if (!user) {
    navigate('/login');
    return;
  }

  // Wrap with navbar
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderNavbar(user);
  const content = document.createElement('div');
  content.id = 'page-content';
  
  app.innerHTML = '';
  app.appendChild(wrapper.firstElementChild);
  app.appendChild(content);
  setupNavbar(user);

  // Load credits in background
  loadNavCredits();

  switch (route) {
    case '/dashboard':
      renderDashboard(content, user, (prompt) => {
        if (prompt) {
          sessionStorage.setItem('ic_selected_prompt', JSON.stringify(prompt));
        } else {
          sessionStorage.removeItem('ic_selected_prompt');
        }
        navigate('/editor');
      });
      break;

    case '/editor':
      const storedPrompt = sessionStorage.getItem('ic_selected_prompt');
      const selectedPrompt = storedPrompt ? JSON.parse(storedPrompt) : null;
      renderEditor(content, user, selectedPrompt, () => navigate('/dashboard'));
      break;

    case '/credits':
      renderCredits(content);
      break;

    case '/admin':
      if (!user.is_admin) {
        navigate('/dashboard');
        return;
      }
      renderAdmin(content);
      break;

    default:
      navigate('/dashboard');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Listen for hash changes
window.addEventListener('hashchange', router);

// Initial route
router();
