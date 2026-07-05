const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const path = require('path');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET not set — using a random one; all logins reset on every restart.');
}

app.set('trust proxy', 1); // secure cookies work behind a reverse proxy (nginx/caddy/PaaS)
app.disable('x-powered-by');

// Basic security headers
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/chart.js/dist')));

// ---------- Sessions ----------
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ client: db.client, dbName: 'trading_journal' }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

// ---------- Auth ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
}

// Small in-memory rate limit for auth endpoints: 20 attempts / 15 min per IP
const attempts = new Map();
function authRateLimit(req, res, next) {
  const now = Date.now();
  const rec = attempts.get(req.ip);
  if (rec && now < rec.reset) {
    if (rec.count >= 20) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    rec.count++;
  } else {
    attempts.set(req.ip, { count: 1, reset: now + 15 * 60 * 1000 });
  }
  if (attempts.size > 10000) attempts.clear(); // crude memory cap
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

app.post('/api/auth/signup', authRateLimit, async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username: 3–30 letters, numbers or _' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const result = await db.users().insertOne({
      username,
      passwordHash: hashPassword(password),
      createdAt: new Date(),
    });
    req.session.userId = result.insertedId.toString();
    req.session.username = username;
    res.json({ username });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Username already taken' });
    throw err;
  }
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = await db.users().findOne({ username });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  req.session.userId = user._id.toString();
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  res.json({ username: req.session.username });
});

// ---------- Trades (all scoped to the logged-in user) ----------
function userFilter(req, extra = {}) {
  return { userId: new ObjectId(req.session.userId), ...extra };
}

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

// List trades — screenshots excluded to keep the payload small
app.get('/api/trades', requireAuth, async (req, res) => {
  const docs = await db.trades()
    .find(userFilter(req), { projection: { note: 1, date: 1, asset: 1, direction: 1, type: 1,
      strategy: 1, psychology: 1, confidence: 1, tf_1d: 1, tf_1h: 1, tf_5m: 1, rr: 1, pnl: 1, fee: 1,
      screenshot: { $cond: [{ $gt: ['$screenshot', null] }, true, false] } } })
    .sort({ date: -1, _id: -1 })
    .toArray();
  res.json(docs.map((d) => {
    const { _id, userId, screenshot, ...rest } = d;
    return { id: _id.toString(), hasScreenshot: !!screenshot, ...rest };
  }));
});

// Full-size screenshot for one trade
app.get('/api/trades/:id/screenshot', requireAuth, async (req, res) => {
  const _id = parseId(req.params.id);
  if (!_id) return res.status(400).json({ error: 'Bad id' });
  const doc = await db.trades().findOne(userFilter(req, { _id }), { projection: { screenshot: 1 } });
  if (!doc || !doc.screenshot) return res.status(404).json({ error: 'No screenshot' });
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(doc.screenshot);
  if (!match) return res.status(500).json({ error: 'Corrupt screenshot' });
  res.set('Content-Type', match[1]);
  res.set('Cache-Control', 'private, max-age=86400');
  res.send(Buffer.from(match[2], 'base64'));
});

app.post('/api/trades', requireAuth, async (req, res) => {
  const b = req.body;
  const required = ['asset', 'direction', 'type', 'strategy'];
  for (const f of required) {
    if (!b[f]) return res.status(400).json({ error: `Missing field: ${f}` });
  }
  const asset = b.asset === 'OTHER' ? (b.assetOther || '').trim().toUpperCase() : b.asset;
  if (!asset) return res.status(400).json({ error: 'Asset name is required' });

  const screenshot = /^data:image\/[a-z+]+;base64,/.test(b.screenshot || '') ? b.screenshot : null;

  const doc = {
    userId: new ObjectId(req.session.userId),
    date: b.date || new Date().toISOString().slice(0, 10),
    asset,
    direction: b.direction === 'SELL' ? 'SELL' : 'BUY',
    type: b.type === 'NEWS' ? 'NEWS' : 'CHART',
    strategy: String(b.strategy),
    psychology: Number(b.psychology) || 0,
    confidence: Number(b.confidence) || 0,
    tf_1d: Number(b.tf_1d) || 0,
    tf_1h: Number(b.tf_1h) || 0,
    tf_5m: Number(b.tf_5m) || 0,
    rr: Number(b.rr) || 0,
    pnl: Number(b.pnl) || 0,                  // signed: profit positive, loss negative
    fee: Math.abs(Number(b.fee)) || 0,        // always positive, always deducted
    note: b.note || '',
    screenshot,
    createdAt: new Date(),
  };
  const result = await db.trades().insertOne(doc);
  const { userId, screenshot: s, ...rest } = doc;
  res.json({ id: result.insertedId.toString(), hasScreenshot: !!s, ...rest });
});

app.delete('/api/trades/:id', requireAuth, async (req, res) => {
  const _id = parseId(req.params.id);
  if (!_id) return res.status(400).json({ error: 'Bad id' });
  const result = await db.trades().deleteOne(userFilter(req, { _id }));
  if (!result.deletedCount) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Surface unhandled route errors as JSON instead of crashing the request
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

db.connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Trading journal running at http://localhost:${PORT} (MongoDB connected)`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
