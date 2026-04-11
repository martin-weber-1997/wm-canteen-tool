# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (uses tsx watch for hot-reload)
- **Build:** `npm run build` (TypeScript → `dist/`)
- **Start (prod):** `npm start` (runs `dist/server.js`)
- **Local database:** `docker compose up -d` (PostgreSQL on localhost:5432)

No test framework is configured.

## Architecture

Single-file Express + Socket.IO server (`server.ts`) with vanilla HTML/CSS/JS frontend pages in `public/`.

### Backend (`server.ts`)

- **Database:** Raw SQL via `pg.Pool` — no ORM. Helper functions `query()` and `queryOne()` wrap `pool.query()`.
- **Schema init:** `initDb()` runs `CREATE TABLE IF NOT EXISTS` on startup and seeds example items if the `items` table is empty. Tables: `items`, `orders`, `order_items`, `meta` (key-value for order counter).
- **Auth:** PIN-based with three roles (`order`, `kitchen`, `admin`). PINs set via env vars. Sessions use `cookie-session`. Admin role has access to all views.
- **Realtime:** Socket.IO emits events (`new-order`, `order-done`, `item-updated`, `item-deleted`) to all connected clients. Socket connections are authenticated via the same cookie session.
- **Database flexibility:** Connects to local PostgreSQL by default; supports Supabase by detecting "supabase" in `DATABASE_URL` to enable SSL.

### Frontend (`public/`)

- Separate HTML/JS/CSS per view: `login`, `order`, `kitchen`, `admin`, plus shared `index.html` (landing redirect).
- `config.js` fetches `/api/config` for locale/currency formatting — imported by other pages.
- Each view connects its own Socket.IO client for realtime updates.
- No build step, no bundler, no framework — plain browser JS with `fetch()` and DOM manipulation.

### Environment Variables

Configured in `.env` (see `.env.example`): `DATABASE_URL`, `ORDER_PIN`, `KITCHEN_PIN`, `ADMIN_PIN`, `SESSION_SECRET`, `PORT`, `LOCALE`, `CURRENCY`.
