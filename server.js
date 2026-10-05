const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const STAGES = ['Applied', 'Interview', 'Offer', 'Rejected'];
const db = new Database(process.env.DB_FILE || 'tracker.db');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Applied',
  applied_date TEXT NOT NULL,
  follow_up_date TEXT,
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_apps_user ON applications(user_id, status);
`);

const app = express();
app.use(express.json());
app.use(express.static('public'));

const sign = (u) => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.userId = jwt.verify(token, SECRET).id; next(); }
  catch { res.status(401).json({ error: 'Please log in again.' }); }
}

function validate(b) {
  if (!b.company?.trim() || !b.role?.trim()) return 'Company and role are required.';
  if (!STAGES.includes(b.status)) return 'Invalid status.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.applied_date || '')) return 'Applied date is required.';
  return null;
}

app.post('/api/signup', (req, res) => {
  const { email, password } = req.body;
  if (!email?.includes('@') || (password || '').length < 8)
    return res.status(400).json({ error: 'Use a valid email and a password of 8+ characters.' });
  try {
    const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .run(email.toLowerCase(), bcrypt.hashSync(password, 10));
    res.json({ token: sign({ id: info.lastInsertRowid }) });
  } catch { res.status(409).json({ error: 'That email already has an account.' }); }
});

app.post('/api/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get((req.body.email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash))
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  res.json({ token: sign(u) });
});

app.get('/api/applications', auth, (req, res) => {
  const { status } = req.query;
  const rows = status && STAGES.includes(status)
    ? db.prepare('SELECT * FROM applications WHERE user_id = ? AND status = ? ORDER BY applied_date DESC').all(req.userId, status)
    : db.prepare('SELECT * FROM applications WHERE user_id = ? ORDER BY applied_date DESC').all(req.userId);
  res.json(rows);
});

app.post('/api/applications', auth, (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const info = db.prepare(`INSERT INTO applications (user_id, company, role, status, applied_date, follow_up_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(req.userId, b.company.trim(), b.role.trim(), b.status, b.applied_date, b.follow_up_date || null, b.notes || '');
  res.status(201).json({ id: info.lastInsertRowid });
});

app.put('/api/applications/:id', auth, (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const info = db.prepare(`UPDATE applications SET company=?, role=?, status=?, applied_date=?, follow_up_date=?, notes=?
    WHERE id=? AND user_id=?`).run(b.company.trim(), b.role.trim(), b.status, b.applied_date, b.follow_up_date || null, b.notes || '', req.params.id, req.userId);
  info.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Application not found.' });
});

app.delete('/api/applications/:id', auth, (req, res) => {
  const info = db.prepare('DELETE FROM applications WHERE id=? AND user_id=?').run(req.params.id, req.userId);
  info.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Application not found.' });
});

app.get('/api/stats', auth, (req, res) => {
  const perWeek = db.prepare(`SELECT strftime('%Y-W%W', applied_date) AS week, COUNT(*) AS count
    FROM applications WHERE user_id=? GROUP BY week ORDER BY week DESC LIMIT 12`).all(req.userId).reverse();
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  db.prepare('SELECT status, COUNT(*) c FROM applications WHERE user_id=? GROUP BY status').all(req.userId)
    .forEach((r) => (counts[r.status] = r.c));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const responded = total - counts.Applied;
  res.json({ perWeek, counts, total, responseRate: total ? Math.round((responded / total) * 100) : 0 });
});

app.get('/api/export.csv', auth, (req, res) => {
  const rows = db.prepare('SELECT company, role, status, applied_date, follow_up_date, notes FROM applications WHERE user_id=? ORDER BY applied_date DESC').all(req.userId);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['Company,Role,Status,Applied,Follow-up,Notes', ...rows.map((r) => Object.values(r).map(esc).join(','))].join('\n');
  res.type('text/csv').send(csv);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Job tracker running at http://localhost:${port}`));
