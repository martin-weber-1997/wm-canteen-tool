// Nav switcher
document.getElementById('nav-toggle').addEventListener('click', () => {
  document.getElementById('nav-menu').classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-switcher')) document.getElementById('nav-menu').classList.remove('open');
});

const socket = io();

let menuItems = [];
let currentOrder = {}; // { itemId: quantity }
let activeCategory = 'All';

const categoryBar = document.getElementById('category-bar');
const itemGrid = document.getElementById('item-grid');
const orderLines = document.getElementById('order-lines');
const orderTotalEl = document.getElementById('order-total');
const submitBtn = document.getElementById('submit-btn');
const confirmationEl = document.getElementById('confirmation');
const confirmationNumber = document.getElementById('confirmation-number');
const toastEl = document.getElementById('toast');

// --- Init ---
async function init() {
  await loadConfig();
  const res = await fetch('/api/items');
  if (res.status === 401) { window.location.href = '/'; return; }
  menuItems = await res.json();
  renderCategories();
  renderItems();
}

// --- Categories ---
function getCategories() {
  const cats = [...new Set(menuItems.map(i => i.category))];
  return ['All', ...cats];
}

function renderCategories() {
  const cats = getCategories();
  categoryBar.innerHTML = cats.map(c =>
    `<button class="category-tab ${c === activeCategory ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');

  categoryBar.querySelectorAll('.category-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      renderCategories();
      renderItems();
    });
  });
}

// --- Item grid ---
function renderItems() {
  const filtered = activeCategory === 'All'
    ? menuItems
    : menuItems.filter(i => i.category === activeCategory);

  itemGrid.innerHTML = filtered.map(item => {
    const qty = currentOrder[item.id] || 0;
    const soldOut = item.sold_out;
    return `
      <div class="item-card ${soldOut ? 'sold-out' : ''}" data-id="${item.id}">
        ${qty > 0 ? `<div class="item-qty-badge">${qty}</div>` : ''}
        <div class="item-name">${esc(item.name)}</div>
        <div class="item-price">${formatPrice(item.price)}</div>
        ${soldOut ? '<div class="sold-out-label">Sold Out</div>' : ''}
      </div>
    `;
  }).join('');

  itemGrid.querySelectorAll('.item-card:not(.sold-out)').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id);
      currentOrder[id] = (currentOrder[id] || 0) + 1;
      renderItems();
      renderOrderSummary();
    });
  });
}

// --- Order summary ---
function renderOrderSummary() {
  const entries = Object.entries(currentOrder).filter(([, qty]) => qty > 0);

  if (entries.length === 0) {
    orderLines.innerHTML = '<div class="empty-order">Tap items to add them</div>';
    orderTotalEl.textContent = formatPrice(0);
    submitBtn.disabled = true;
    return;
  }

  submitBtn.disabled = false;
  let total = 0;

  orderLines.innerHTML = entries.map(([idStr, qty]) => {
    const item = menuItems.find(i => i.id === Number(idStr));
    if (!item) return '';
    const lineTotal = item.price * qty;
    total += lineTotal;
    return `
      <div class="order-line">
        <div class="line-info">
          <div class="line-name">${esc(item.name)}</div>
          <div class="line-price">${formatPrice(lineTotal)}</div>
        </div>
        <div class="line-controls">
          <button class="qty-btn" data-id="${item.id}" data-action="dec">-</button>
          <span class="line-qty">${qty}</span>
          <button class="qty-btn" data-id="${item.id}" data-action="inc">+</button>
          <button class="line-remove" data-id="${item.id}" data-action="remove">&times;</button>
        </div>
      </div>
    `;
  }).join('');

  orderTotalEl.textContent = formatPrice(total);

  orderLines.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const action = btn.dataset.action;
      if (action === 'inc') currentOrder[id]++;
      else if (action === 'dec') { currentOrder[id]--; if (currentOrder[id] <= 0) delete currentOrder[id]; }
      else if (action === 'remove') delete currentOrder[id];
      renderItems();
      renderOrderSummary();
    });
  });
}

// --- Submit ---
submitBtn.addEventListener('click', async () => {
  const items = Object.entries(currentOrder)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ itemId: Number(id), quantity: qty }));

  if (items.length === 0) return;

  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, rush: document.getElementById('rush-check').checked }),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Failed to submit order');
      submitBtn.disabled = false;
      return;
    }

    const order = await res.json();
    currentOrder = {};
    document.getElementById('rush-check').checked = false;
    renderItems();
    renderOrderSummary();
    showConfirmation(order.order_number);
  } catch (e) {
    showToast('Connection error');
    submitBtn.disabled = false;
  }
});

function showConfirmation(num) {
  confirmationNumber.textContent = `#${num}`;
  confirmationEl.classList.add('show');
  setTimeout(() => confirmationEl.classList.remove('show'), 3000);
}

// --- Socket events ---
socket.on('item-updated', (item) => {
  if (item.archived) {
    menuItems = menuItems.filter(i => i.id !== item.id);
    delete currentOrder[item.id];
    renderOrderSummary();
  } else {
    const idx = menuItems.findIndex(i => i.id === item.id);
    if (idx >= 0) menuItems[idx] = item;
    else menuItems.push(item);
  }
  renderCategories();
  renderItems();
});

// --- Logout ---
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

// --- Helpers ---
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

init();
