const socket = io();

let items = [];
let editingId = null;

const itemsBody = document.getElementById('items-body');
const toastEl = document.getElementById('toast');
const editModal = document.getElementById('edit-modal');

async function init() {
  await loadConfig();
  const res = await fetch('/api/items');
  if (res.status === 401) { window.location.href = '/'; return; }
  items = await res.json();
  renderItems();
  loadStats();
  loadOrders();
}

function getCategories() {
  return [...new Set(items.map(i => i.category))];
}

function renderCategoryChips(chipsEl, inputEl) {
  const cats = getCategories();
  let current = inputEl.value.trim();
  // Auto-select first category if nothing selected
  if (!current && cats.length > 0) {
    current = cats[0];
    inputEl.value = current;
  }
  chipsEl.innerHTML = cats.map(c =>
    `<button type="button" class="category-chip ${c === current ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`
  ).join('');
  chipsEl.querySelectorAll('.category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      inputEl.value = chip.dataset.cat;
      renderCategoryChips(chipsEl, inputEl);
    });
  });
}

function renderItems() {
  renderCategoryChips(document.getElementById('new-category-chips'), document.getElementById('new-category'));

  itemsBody.innerHTML = items.map(item => `
    <tr>
      <td>${esc(item.name)}</td>
      <td>${formatPrice(item.price)}</td>
      <td>${esc(item.category)}</td>
      <td>
        <div class="sold-out-toggle ${item.sold_out ? 'active' : ''}" data-id="${item.id}" data-action="toggle-sold-out"></div>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn btn-outline btn-sm" data-id="${item.id}" data-action="edit">Edit</button>
          <button class="btn btn-danger btn-sm" data-id="${item.id}" data-action="delete">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Bind events
  itemsBody.querySelectorAll('[data-action="toggle-sold-out"]').forEach(el => {
    el.addEventListener('click', () => toggleSoldOut(Number(el.dataset.id)));
  });
  itemsBody.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEdit(Number(btn.dataset.id)));
  });
  itemsBody.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(Number(btn.dataset.id)));
  });
}

// --- Add item ---
document.getElementById('add-item-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-name').value.trim();
  const priceVal = document.getElementById('new-price').value;
  const price = parseFloat(priceVal);
  const category = document.getElementById('new-category').value.trim() || 'Uncategorized';

  if (!name) { showToast('Enter a name'); return; }
  if (priceVal === '' || isNaN(price) || price < 0) { showToast('Enter a valid price'); return; }

  const res = await fetch('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price, category }),
  });

  if (res.ok) {
    document.getElementById('new-name').value = '';
    document.getElementById('new-price').value = '';
    document.getElementById('new-category').value = '';
    renderCategoryChips(document.getElementById('new-category-chips'), document.getElementById('new-category'));
    showToast('Item added');
  } else {
    showToast('Failed to add item');
  }
});


// --- Toggle sold out ---
async function toggleSoldOut(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  await fetch(`/api/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sold_out: !item.sold_out }),
  });
}

// --- Edit item ---
function openEdit(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  editingId = id;
  document.getElementById('edit-name').value = item.name;
  document.getElementById('edit-price').value = item.price;
  document.getElementById('edit-category').value = item.category;
  renderCategoryChips(document.getElementById('edit-category-chips'), document.getElementById('edit-category'));
  editModal.classList.add('show');
}

document.getElementById('edit-cancel').addEventListener('click', () => {
  editModal.classList.remove('show');
  editingId = null;
});

document.getElementById('edit-save').addEventListener('click', async () => {
  if (!editingId) return;
  const name = document.getElementById('edit-name').value.trim();
  const priceVal = document.getElementById('edit-price').value;
  const price = parseFloat(priceVal);
  const category = document.getElementById('edit-category').value.trim() || 'Uncategorized';

  if (!name) { showToast('Name required'); return; }
  if (priceVal === '' || isNaN(price) || price < 0) { showToast('Enter a valid price'); return; }

  const res = await fetch(`/api/items/${editingId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price, category }),
  });

  if (res.ok) {
    editModal.classList.remove('show');
    editingId = null;
    showToast('Item updated');
  } else {
    showToast('Failed to update');
  }
});

// --- Delete item ---
async function deleteItem(id) {
  if (!confirm('Delete this item?')) return;
  const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
  if (res.ok) showToast('Item deleted');
  else showToast('Failed to delete');
}

// --- Reset order numbers ---
document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('Reset order numbers to 1?')) return;
  const res = await fetch('/api/reset-order-numbers', { method: 'POST' });
  if (res.ok) showToast('Order numbers reset');
  else showToast('Failed to reset');
});

// --- Stats ---
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const stats = await res.json();

    document.getElementById('stat-total').textContent = stats.totalOrders;
    document.getElementById('stat-pending').textContent = stats.pendingOrders;
    document.getElementById('stat-done').textContent = stats.completedOrders;
    document.getElementById('stat-revenue').textContent = formatPrice(stats.totalRevenue);

    const topSellers = document.getElementById('top-sellers');
    if (stats.itemsSold.length > 0) {
      topSellers.innerHTML = stats.itemsSold.map((item, i) => `
        <div class="top-seller-row">
          <span class="rank">${i + 1}.</span>
          <span class="name">${esc(item.item_name)}</span>
          <span class="qty">${item.total_qty} sold</span>
          <span class="rev">${formatPrice(item.total_revenue)}</span>
        </div>
      `).join('');
    }
  } catch (e) {}
}

// --- Order History ---
async function loadOrders() {
  try {
    const res = await fetch('/api/orders');
    if (!res.ok) return;
    const orders = await res.json();
    const historyEl = document.getElementById('order-history');

    if (orders.length === 0) {
      historyEl.innerHTML = '<div class="history-empty">No orders yet</div>';
      return;
    }

    historyEl.innerHTML = '<div class="order-history-list">' + orders.map(order => `
      <div class="history-card">
        <div class="history-num ${order.rush ? 'rush' : ''}">#${order.order_number}${order.rush ? ' RUSH' : ''}</div>
        <div class="history-details">
          <div class="history-items">${order.items.map(i => `${i.quantity}x ${esc(i.item_name)}`).join(', ')}</div>
          <div class="history-meta">
            <span class="${order.status === 'done' ? 'status-done' : 'status-pending'}">${order.status.toUpperCase()}</span>
            <span>${formatDate(order.created_at)}</span>
          </div>
        </div>
        <div class="history-total">${formatPrice(order.total)}</div>
      </div>
    `).join('') + '</div>';
  } catch (e) {}
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// --- Socket events ---
socket.on('item-updated', (item) => {
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.push(item);
  renderItems();
});

socket.on('item-deleted', ({ itemId }) => {
  items = items.filter(i => i.id !== itemId);
  renderItems();
});

socket.on('new-order', () => { loadStats(); loadOrders(); });
socket.on('order-done', () => { loadStats(); loadOrders(); });

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
