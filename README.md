# Trading Journal

A personal trading journal with a TradeZella-style dashboard. Node.js + Express + MongoDB Atlas, no build step. Multi-user with signup/login; every user sees only their own trades.

## Run locally

```bash
npm install
cp .env.example .env   # then fill in MONGODB_URI and SESSION_SECRET
npm start              # or: npm run dev (auto-restarts on file changes)
```

Open http://localhost:3000 — you'll be redirected to the login page; sign up first.

## Run in production (Docker)

```bash
docker build -t trading-journal .
docker run -d --name journal -p 3000:3000 \
  -e MONGODB_URI='mongodb+srv://USER:PASSWORD@cluster0.be40sko.mongodb.net/' \
  -e SESSION_SECRET='your-long-random-secret' \
  --restart unless-stopped \
  trading-journal
```

Put a reverse proxy with HTTPS in front (Caddy, nginx + certbot, or your PaaS).
The app sets `trust proxy`, so secure session cookies work automatically behind it.

## Configuration (environment variables)

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection string. **Never hardcode or commit it.** |
| `SESSION_SECRET` | Signs login cookies. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | Optional, defaults to 3000 |

Locally these load from `.env` (git-ignored). In Docker pass them with `-e`.

## Data & backups

Everything (users, trades, screenshots) lives in MongoDB Atlas — database
`trading_journal`. Nothing is stored on the app server, so the container is
disposable.

To keep the data safe long-term:

- **Run `npm run backup`** — dumps all trades + users (screenshots included) to
  `backups/backup-<timestamp>.json`. Schedule it (cron) and copy the files
  somewhere off-machine (cloud drive, second disk).
- **Atlas free tier (M0) has no automatic backups.** Either rely on the backup
  script above, or upgrade to a paid tier (M10+) for continuous cloud backups.
- In Atlas, keep **Network Access** restricted to the IPs of your server and
  home, not `0.0.0.0/0`, if you can.

## Security notes

- Passwords are hashed with scrypt; sessions are httpOnly cookies stored in MongoDB.
- Login/signup endpoints are rate-limited (20 attempts / 15 min per IP).
- All trade APIs require login and are scoped to the session's user.
- Rotate the database password in Atlas if it was ever shared or committed.

## P&L rules

- **P&L** is signed: type `150` for a profit, `-75` for a loss.
- **Fee** is always positive and always deducted: `net = pnl - fee`.
- WIN / LOSS / BREAK-EVEN is derived from the net result.

## Journal score

A 0–100 composite: win rate (30%), profit factor capped at 3 (25%),
avg win/loss ratio capped at 2 (20%), day win % (15%),
discipline = average of psychology + confidence ratings (10%).
# journal
