import 'dotenv/config';
import express from 'express';
import type { RequestHandler } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cookieSession from 'cookie-session';
import path from 'path';
import pg from 'pg';

const app = express();
const server = http.createServer(app);

const PROJECT_ROOT = __dirname.endsWith('dist') ? path.join(__dirname, '..') : __dirname;

const PORT = Number(process.env.PORT) || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://canteen:canteen@localhost:5432/canteen';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me';
const ORDER_PIN = process.env.ORDER_PIN || '1234';
const KITCHEN_PIN = process.env.KITCHEN_PIN || '5678';
const ADMIN_PIN = process.env.ADMIN_PIN || '9999';
const LOCALE = process.env.LOCALE || 'de-DE';
const CURRENCY = process.env.CURRENCY || 'EUR';

type Role = 'order' | 'kitchen' | 'admin';

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : undefined,
});

// Session middleware
const sessionMiddleware = cookieSession({
  name: 'canteen_session',
  keys: [SESSION_SECRET],
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: 'lax' as const,
  httpOnly: true,
});

app.use(sessionMiddleware);
app.use(express.json());

// --- Database helpers ---
async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

async function initDb(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'Uncategorized',
    sold_out BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Add archived column if missing (migration for existing databases)
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false`);

  await pool.query(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    rush BOOLEAN NOT NULL DEFAULT false,
    total NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    item_id INTEGER NOT NULL REFERENCES items(id),
    item_name TEXT NOT NULL,
    item_price NUMERIC(10,2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  const counter = await queryOne("SELECT value FROM meta WHERE key = 'order_counter'");
  if (!counter) {
    await pool.query("INSERT INTO meta (key, value) VALUES ('order_counter', '0')");
  }

  // Seed example items if empty
  const countResult = await queryOne<{ count: string }>("SELECT COUNT(*) as count FROM items");
  if (countResult && parseInt(countResult.count) === 0) {
    const seeds: [string, number, string, number][] = [
      ['Cheeseburger', 8.5, 'Food', 1],
      ['Hot Dog', 5.0, 'Food', 2],
      ['Fries', 4.0, 'Food', 3],
      ['Caesar Salad', 7.0, 'Food', 4],
      ['Cola', 3.0, 'Drinks', 5],
      ['Lemonade', 3.5, 'Drinks', 6],
      ['Water', 2.0, 'Drinks', 7],
      ['Coffee', 3.0, 'Drinks', 8],
      ['Brownie', 4.0, 'Desserts', 9],
      ['Ice Cream', 3.5, 'Desserts', 10],
    ];
    for (const [name, price, category, sort] of seeds) {
      await pool.query(
        "INSERT INTO items (name, price, category, sort_order) VALUES ($1, $2, $3, $4)",
        [name, price, category, sort]
      );
    }
  }
}

// --- Socket.IO ---
const io = new Server(server);

io.use((socket, next) => {
  const req = socket.request as any;
  const res = { on() {}, end() {} } as any;
  sessionMiddleware(req, res, () => {
    if (!req.session?.role) {
      return next(new Error('Unauthorized'));
    }
    (socket as any).role = req.session.role;
    next();
  });
});

// --- Auth middleware ---
function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    const session = (req as any).session;
    if (!session?.role || !roles.includes(session.role)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}

function getSession(req: any): { role?: Role } {
  return req.session ?? {};
}

// --- Public config ---
app.get('/api/config', ((_req, res) => {
  res.json({ locale: LOCALE, currency: CURRENCY });
}) as RequestHandler);

// --- Auth routes ---
app.post('/api/auth/login', ((req, res) => {
  const { pin } = req.body;
  if (!pin) { res.status(400).json({ error: 'PIN required' }); return; }

  const pinStr = String(pin);
  let role: Role | null = null;
  if (pinStr === ADMIN_PIN) role = 'admin';
  else if (pinStr === ORDER_PIN) role = 'order';
  else if (pinStr === KITCHEN_PIN) role = 'kitchen';

  if (!role) { res.status(401).json({ error: 'Invalid PIN' }); return; }

  (req as any).session.role = role;
  res.json({ role });
}) as RequestHandler);

app.post('/api/auth/logout', ((req, res) => {
  (req as any).session = null;
  res.json({ ok: true });
}) as RequestHandler);

app.get('/api/auth/me', ((req, res) => {
  const session = getSession(req);
  if (!session.role) { res.status(401).json({ error: 'Not authenticated' }); return; }
  res.json({ role: session.role });
}) as RequestHandler);

// --- Item routes ---
app.get('/api/items', requireRole('order', 'kitchen', 'admin'), (async (req, res) => {
  const includeArchived = req.query.include_archived === '1';
  const sql = includeArchived
    ? "SELECT * FROM items ORDER BY archived, sort_order, id"
    : "SELECT * FROM items WHERE archived = false ORDER BY sort_order, id";
  const items = await query(sql);
  res.json(items);
}) as RequestHandler);

app.post('/api/items', requireRole('admin'), (async (req, res) => {
  const { name, price, category } = req.body;
  if (!name) { res.status(400).json({ error: 'Name required' }); return; }

  const maxSort = await queryOne<{ m: number }>("SELECT COALESCE(MAX(sort_order), 0) as m FROM items");
  const rows = await query(
    "INSERT INTO items (name, price, category, sort_order) VALUES ($1, $2, $3, $4) RETURNING *",
    [name, price || 0, category || 'Uncategorized', (maxSort?.m ?? 0) + 1]
  );

  const newItem = rows[0];
  io.emit('item-updated', newItem);
  res.status(201).json(newItem);
}) as RequestHandler);

app.put('/api/items/:id', requireRole('admin'), (async (req, res) => {
  const id = Number(req.params.id);
  const existing = await queryOne("SELECT * FROM items WHERE id = $1", [id]);
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  const { name, price, category, sold_out, sort_order } = req.body;
  const rows = await query(
    `UPDATE items SET name = $1, price = $2, category = $3, sold_out = $4, sort_order = $5
     WHERE id = $6 RETURNING *`,
    [
      name ?? existing.name,
      price ?? existing.price,
      category ?? existing.category,
      sold_out ?? existing.sold_out,
      sort_order ?? existing.sort_order,
      id,
    ]
  );

  const updated = rows[0];
  io.emit('item-updated', updated);
  res.json(updated);
}) as RequestHandler);

app.delete('/api/items/:id', requireRole('admin'), (async (req, res) => {
  const id = Number(req.params.id);
  const rows = await query(
    "UPDATE items SET archived = true WHERE id = $1 RETURNING *", [id]
  );
  if (!rows.length) { res.status(404).json({ error: 'Item not found' }); return; }
  io.emit('item-updated', rows[0]);
  res.json({ ok: true });
}) as RequestHandler);

app.post('/api/items/:id/restore', requireRole('admin'), (async (req, res) => {
  const id = Number(req.params.id);
  const rows = await query(
    "UPDATE items SET archived = false WHERE id = $1 RETURNING *", [id]
  );
  if (!rows.length) { res.status(404).json({ error: 'Item not found' }); return; }
  io.emit('item-updated', rows[0]);
  res.json(rows[0]);
}) as RequestHandler);

// --- Order routes ---
app.post('/api/orders', requireRole('order', 'admin'), (async (req, res) => {
  const { items, rush } = req.body as { items: { itemId: number; quantity: number }[]; rush?: boolean };
  if (!items?.length) { res.status(400).json({ error: 'Items required' }); return; }

  // Next order number (atomic update)
  const counterRows = await query<{ value: string }>(
    "UPDATE meta SET value = (CAST(value AS INTEGER) + 1)::TEXT WHERE key = 'order_counter' RETURNING value"
  );
  const nextNumber = parseInt(counterRows[0].value);

  // Validate and calculate
  let total = 0;
  const orderItems: { item: Record<string, unknown>; quantity: number }[] = [];
  for (const { itemId, quantity: qty } of items) {
    const item = await queryOne("SELECT * FROM items WHERE id = $1", [itemId]);
    if (!item) { res.status(400).json({ error: `Item ${itemId} not found` }); return; }
    if (item.sold_out) { res.status(400).json({ error: `${item.name} is sold out` }); return; }
    const q = qty || 1;
    total += Number(item.price) * q;
    orderItems.push({ item, quantity: q });
  }

  const orderRows = await query(
    "INSERT INTO orders (order_number, status, rush, total) VALUES ($1, 'pending', $2, $3) RETURNING *",
    [nextNumber, rush ?? false, total]
  );
  const order = orderRows[0];

  for (const { item, quantity } of orderItems) {
    await pool.query(
      "INSERT INTO order_items (order_id, item_id, item_name, item_price, quantity) VALUES ($1, $2, $3, $4, $5)",
      [order.id, item.id, item.name, item.price, quantity]
    );
  }

  const lineItems = await query("SELECT * FROM order_items WHERE order_id = $1", [order.id as number]);
  const fullOrder = { ...order, items: lineItems };

  io.emit('new-order', fullOrder);
  res.status(201).json(fullOrder);
}) as RequestHandler);

app.get('/api/orders', requireRole('kitchen', 'admin'), (async (req, res) => {
  const { status } = req.query;
  let orders: Record<string, unknown>[];
  if (status) {
    orders = await query("SELECT * FROM orders WHERE status = $1 ORDER BY id ASC", [status as string]);
  } else {
    orders = await query("SELECT * FROM orders ORDER BY id DESC");
  }

  for (const order of orders) {
    order.items = await query("SELECT * FROM order_items WHERE order_id = $1", [order.id as number]);
  }
  res.json(orders);
}) as RequestHandler);

app.put('/api/orders/:id/done', requireRole('kitchen', 'admin'), (async (req, res) => {
  const id = Number(req.params.id);
  const now = new Date().toISOString();
  const rows = await query(
    "UPDATE orders SET status = 'done', completed_at = $1 WHERE id = $2 RETURNING *",
    [now, id]
  );

  const order = rows[0];
  if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

  io.emit('order-done', { orderId: order.id, orderNumber: order.order_number, completedAt: now });
  res.json(order);
}) as RequestHandler);

// --- Admin actions ---
app.post('/api/reset-order-numbers', requireRole('admin'), (async (_req, res) => {
  await pool.query("UPDATE meta SET value = '0' WHERE key = 'order_counter'");
  res.json({ ok: true });
}) as RequestHandler);

app.get('/api/stats', requireRole('admin'), (async (_req, res) => {
  const totalOrders = await queryOne<{ count: string }>("SELECT COUNT(*) as count FROM orders");
  const totalRevenue = await queryOne<{ sum: string }>("SELECT COALESCE(SUM(total), 0) as sum FROM orders");
  const pendingOrders = await queryOne<{ count: string }>("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
  const completedOrders = await queryOne<{ count: string }>("SELECT COUNT(*) as count FROM orders WHERE status = 'done'");
  const itemsSold = await query(`
    SELECT item_name, SUM(quantity) as total_qty, SUM(item_price * quantity) as total_revenue
    FROM order_items GROUP BY item_name ORDER BY total_qty DESC
  `);

  res.json({
    totalOrders: parseInt(totalOrders?.count ?? '0'),
    totalRevenue: parseFloat(totalRevenue?.sum ?? '0'),
    pendingOrders: parseInt(pendingOrders?.count ?? '0'),
    completedOrders: parseInt(completedOrders?.count ?? '0'),
    itemsSold,
  });
}) as RequestHandler);

// --- Static files & view routes ---
app.use(express.static(path.join(PROJECT_ROOT, 'public')));

function serveView(role: Role, file: string): RequestHandler {
  return (req, res) => {
    const session = getSession(req);
    if (!session.role || (session.role !== role && session.role !== 'admin')) {
      res.redirect(`/login.html?redirect=${req.path}`);
      return;
    }
    res.sendFile(path.join(PROJECT_ROOT, 'public', file));
  };
}

app.get('/order', serveView('order', 'order.html'));
app.get('/kitchen', serveView('kitchen', 'kitchen.html'));
app.get('/admin', serveView('admin', 'admin.html'));
app.get('/', ((req, res) => {
  const session = getSession(req);
  const routes: Record<string, string> = { admin: '/admin', order: '/order', kitchen: '/kitchen' };
  if (session.role && routes[session.role]) {
    res.redirect(routes[session.role]);
    return;
  }
  res.sendFile(path.join(PROJECT_ROOT, 'public', 'index.html'));
}) as RequestHandler);

// --- Start ---
initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`Canteen server running at http://localhost:${PORT}`);
    console.log(`  Order:   http://localhost:${PORT}/order`);
    console.log(`  Kitchen: http://localhost:${PORT}/kitchen`);
    console.log(`  Admin:   http://localhost:${PORT}/admin`);
  });
});
