# Canteen

A real-time canteen order management system with separate views for ordering, kitchen display, and admin management.

## Features

- **Order view** — tap-based menu for taking customer orders
- **Kitchen view** — live order queue with pending/done columns
- **Admin view** — menu management, order history, and stats
- **Real-time updates** — orders appear instantly on kitchen screens via WebSockets
- **PIN-based auth** — separate PINs for order, kitchen, and admin roles
- **Dark/light mode** — toggle on all views, preference persisted in browser
- **Mobile-friendly** — responsive layouts for tablets and phones

## Quick Start

### Local development

```bash
# Start PostgreSQL
docker compose up -d

# Install dependencies
npm install

# Start dev server (hot-reload)
npm run dev
```

Open http://localhost:3000. Default PINs: order `1234`, kitchen `5678`, admin `9999`.

### Production build

```bash
npm run build
npm start
```

## Deployment

The app is configured for deployment on **Render** with a **Supabase** PostgreSQL database.

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Settings → Database → Connection string** and select **Session Pooler**
3. Copy the `postgresql://` URI (not JDBC)

> **Important:** Use the **Session Pooler** connection string (port 5432 via `pooler.supabase.com`). The direct connection requires IPv4 which is a paid add-on. The session pooler resolves to IPv4 and works on Render's free tier.

### Render setup

1. Connect your GitHub repo at [render.com](https://render.com)
2. Render auto-detects `render.yaml` and `Dockerfile`
3. Set environment variables: `DATABASE_URL` (Supabase session pooler URI), `ORDER_PIN`, `KITCHEN_PIN`, `ADMIN_PIN`
4. `SESSION_SECRET` is auto-generated

Pushes to `main` trigger automatic deploys.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://canteen:canteen@localhost:5432/canteen` | PostgreSQL connection string |
| `ORDER_PIN` | `1234` | PIN for order view |
| `KITCHEN_PIN` | `5678` | PIN for kitchen view |
| `ADMIN_PIN` | `9999` | PIN for admin view |
| `SESSION_SECRET` | `change-me` | Cookie session secret |
| `PORT` | `3000` | Server port |
| `LOCALE` | `de-DE` | Locale for price formatting |
| `CURRENCY` | `EUR` | Currency for price formatting |

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO, pg (raw SQL)
- **Frontend:** Vanilla HTML/CSS/JS (no framework, no build step)
- **Database:** PostgreSQL (local via Docker or Supabase)
- **Deployment:** Docker, Render
