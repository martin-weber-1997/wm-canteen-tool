// Nav switcher
document.getElementById('nav-toggle').addEventListener('click', () => {
  document.getElementById('nav-menu').classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-switcher')) document.getElementById('nav-menu').classList.remove('open');
});

const socket = io();

let pendingOrders = [];
let doneOrders = [];
let menuItems = [];
let activeFilter = 'All';
let showDone = true;

// --- Chime (Web Audio API) ---
let audioCtx = null;
function playChime() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, audioCtx.currentTime);
  osc.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.4);
}
// Unlock audio context on first touch (iOS requirement)
document.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}, { once: true });

const pendingEl = document.getElementById('pending-orders');
const doneEl = document.getElementById('done-orders');
const pendingCount = document.getElementById('pending-count');
const doneCount = document.getElementById('done-count');
const filterBar = document.getElementById('filter-bar');
const toastEl = document.getElementById('toast');

async function init() {
  await loadConfig();
  const [pendingRes, doneRes, itemsRes] = await Promise.all([
    fetch('/api/orders?status=pending'),
    fetch('/api/orders?status=done'),
    fetch('/api/items'),
  ]);

  if (pendingRes.status === 401) { window.location.href = '/'; return; }

  pendingOrders = await pendingRes.json();
  doneOrders = (await doneRes.json()).slice(0, 10);
  menuItems = await itemsRes.json();
  renderFilterBar();
  render();
}

function renderFilterBar() {
  const cats = ['All', ...new Set(menuItems.map(i => i.category))];
  filterBar.innerHTML = cats.map(c =>
    `<button class="${c === activeFilter ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');

  filterBar.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.cat;
      renderFilterBar();
      render();
    });
  });
}

function getItemCategory(itemName) {
  const item = menuItems.find(i => i.name === itemName);
  return item ? item.category : null;
}

function filterOrders(orders) {
  if (activeFilter === 'All') return orders;
  return orders.filter(order =>
    order.items.some(item => getItemCategory(item.item_name) === activeFilter)
  );
}

function render() {
  renderPending();
  renderDone();
}

function renderPending() {
  const filtered = filterOrders(pendingOrders);
  pendingCount.textContent = filtered.length;

  if (filtered.length === 0) {
    pendingEl.innerHTML = '<div class="empty-col">No pending orders</div>';
    return;
  }

  // Rush orders first
  const sorted = [...filtered].sort((a, b) => (b.rush || 0) - (a.rush || 0));

  pendingEl.innerHTML = sorted.map(order => `
    <div class="order-card ${order.rush ? 'rush' : ''}" data-id="${order.id}">
      <div class="order-card-header">
        <div class="order-num">#${order.order_number}${order.rush ? ' <span class="rush-badge">RUSH</span>' : ''}</div>
        <div class="order-time">${timeAgo(order.created_at)}</div>
      </div>
      <ul class="order-items-list">
        ${order.items.map(item => `
          <li>
            <span><span class="qty">${item.quantity}x</span> ${esc(item.item_name)}</span>
          </li>
        `).join('')}
      </ul>
      <button class="done-btn" data-id="${order.id}">Done</button>
    </div>
  `).join('');

  pendingEl.querySelectorAll('.done-btn').forEach(btn => {
    btn.addEventListener('click', () => markDone(Number(btn.dataset.id)));
  });
}

function renderDone() {
  const filtered = filterOrders(doneOrders);
  doneCount.textContent = filtered.length;

  if (filtered.length === 0) {
    doneEl.innerHTML = '<div class="empty-col">No completed orders yet</div>';
    return;
  }

  doneEl.innerHTML = filtered.map(order => `
    <div class="order-card" data-id="${order.id}">
      <div class="order-card-header">
        <div class="order-num">#${order.order_number}</div>
        <div class="order-time">${formatTime(order.completed_at)}</div>
      </div>
      <ul class="order-items-list">
        ${order.items.map(item => `
          <li>
            <span><span class="qty">${item.quantity}x</span> ${esc(item.item_name)}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');
}

async function markDone(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}/done`, { method: 'PUT' });
    if (!res.ok) {
      showToast('Failed to mark order as done');
    }
  } catch (e) {
    showToast('Connection error');
  }
}

// --- Socket events ---
socket.on('new-order', (order) => {
  pendingOrders.push(order);
  render();
  // Only chime if order is visible in current filter
  if (filterOrders([order]).length > 0) playChime();
});

socket.on('order-done', ({ orderId, completedAt }) => {
  const idx = pendingOrders.findIndex(o => o.id === orderId);
  if (idx >= 0) {
    const order = pendingOrders.splice(idx, 1)[0];
    order.status = 'done';
    order.completed_at = completedAt;
    doneOrders.unshift(order);
    if (doneOrders.length > 10) doneOrders.pop();
  }
  render();
});

// --- Toggle done column ---
const toggleDoneBtn = document.getElementById('toggle-done-btn');
const doneCol = document.querySelector('.done-col');
const kitchenBody = document.querySelector('.kitchen-body');
toggleDoneBtn.addEventListener('click', () => {
  showDone = !showDone;
  doneCol.style.display = showDone ? '' : 'none';
  kitchenBody.classList.toggle('grid-mode', !showDone);
  toggleDoneBtn.textContent = showDone ? 'Hide Done' : 'Show Done';
});

// --- Logout ---
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

// --- Helpers ---
function parseDate(dateStr) {
  if (!dateStr) return null;
  // If it already ends with Z or has timezone info, parse directly
  if (dateStr.endsWith('Z') || dateStr.includes('+') || dateStr.includes('T')) {
    return new Date(dateStr);
  }
  // SQLite datetime without timezone — treat as UTC
  return new Date(dateStr + 'Z');
}

function timeAgo(dateStr) {
  const d = parseDate(dateStr);
  if (!d || isNaN(d.getTime())) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function formatTime(dateStr) {
  const d = parseDate(dateStr);
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// Update time-ago every 30s
setInterval(() => renderPending(), 30000);

init();
