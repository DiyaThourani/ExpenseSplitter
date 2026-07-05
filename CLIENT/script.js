// =========================================================
// IMPORTANT: paste your backend's public Codespace URL below
// (Ports tab -> port 3000 -> Forwarded Address, set to Public)
// no trailing slash, re-check this every time the Codespace restarts
// =========================================================
const API_URL = "https://miniature-tribble-q75pgp9vq5j2x5gj-3000.app.github.dev";

const CHART_COLORS = ['#6c5ce7', '#5b8def', '#2ecc9a', '#ff8c5a', '#e5544e', '#f0a83c'];

function getCurrentUser() {
  const stored = sessionStorage.getItem('currentUser');
  return stored ? JSON.parse(stored) : null;
}
function setCurrentUser(user) { sessionStorage.setItem('currentUser', JSON.stringify(user)); }

function requireLogin() {
  const user = getCurrentUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  return user;
}

function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

function setActiveGroup(id, name) {
  sessionStorage.setItem('currentGroupId', id);
  sessionStorage.setItem('currentGroupName', name);
}
function getActiveGroupId() { return sessionStorage.getItem('currentGroupId'); }
function getActiveGroupName() { return sessionStorage.getItem('currentGroupName') || ''; }

async function apiCall(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw new Error((data && data.error) || 'Request failed');
  return data;
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

// Renders the dark sidebar + topbar shell. Call this, then inject your
// page's own content into the element with id="pageContent".
function renderShell(activePage, greetingText) {
  const groupId = getActiveGroupId();
  const groupName = getActiveGroupName();
  const user = getCurrentUser();

  const groupLink = groupId
    ? `<a href="groupDetail.html" class="${activePage === 'groupDetail' ? 'active' : ''}">📁 ${groupName}</a>`
    : '';

  document.body.insertAdjacentHTML('afterbegin', `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">💰 Expense Splitter</div>
        <nav class="sidebar-nav">
          <a href="dashboard.html" class="${activePage === 'dashboard' ? 'active' : ''}">🏠 Dashboard</a>
          <a href="groups.html" class="${activePage === 'groups' ? 'active' : ''}">👥 Groups</a>
          ${groupLink}
          <a href="analytics.html" class="${activePage === 'analytics' ? 'active' : ''}">📊 Analytics</a>
          <a href="notifications.html" class="${activePage === 'notifications' ? 'active' : ''}">🔔 Notifications</a>
        </nav>
        <div class="sidebar-promo">
          <div class="title">🎁 Split expenses<br>Stress less</div>
          <div class="sub">Track, split and settle up with your groups easily.</div>
        </div>
        <div class="sidebar-profile" onclick="toggleSidebarProfile()">
          <div class="avatar">${initials(user ? user.name : '')}</div>
          <div>
            <div class="who">${user ? user.name : ''}</div>
            <div class="email">${user ? user.email : ''}</div>
          </div>
          <div class="sidebar-profile-menu" id="sidebarProfileMenu">
            <button onclick="logout()">Logout</button>
          </div>
        </div>
      </aside>
      <div class="main-area">
        <div class="topbar">
          <div class="greet">${greetingText || ''}</div>
          <div class="search">🔍 Search anything...</div>
          <div class="topbar-actions">
            <div class="bell" onclick="window.location.href='notifications.html'">🔔</div>
          </div>
        </div>
        <div class="content" id="pageContent"></div>
      </div>
    </div>
  `);
}

function toggleSidebarProfile() {
  document.getElementById('sidebarProfileMenu').classList.toggle('open');
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('sidebarProfileMenu');
  const profile = document.querySelector('.sidebar-profile');
  if (menu && profile && !profile.contains(e.target)) menu.classList.remove('open');
});

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function loadChartJs(callback) {
  if (window.Chart) { callback(); return; }
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
  script.onload = callback;
  document.head.appendChild(script);
}
