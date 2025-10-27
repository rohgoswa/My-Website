// Minimal Express server with SQLite-backed API and contact email
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const cors = require('cors');
const Database = require('better-sqlite3');
require('dotenv').config();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve public files
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize DB
const dbFile = path.join(__dirname, 'data.db');
const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.prepare(`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  slug TEXT UNIQUE,
  excerpt TEXT,
  content TEXT,
  published_at TEXT
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  slug TEXT UNIQUE,
  excerpt TEXT,
  content TEXT,
  image TEXT,
  link TEXT,
  created_at TEXT
)`).run();

// Simple admin check middleware (single password via env)
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-pass'] || req.body.admin_pass || req.query.admin_pass;
  if (token === ADMIN_PASS) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// File upload setup
if (!fs.existsSync(path.join(__dirname, 'uploads'))) fs.mkdirSync(path.join(__dirname, 'uploads'));
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });

// APIs: posts
app.get('/api/posts', (req, res) => {
  const rows = db.prepare('SELECT id, title, slug, excerpt, published_at FROM posts ORDER BY published_at DESC').all();
  res.json(rows);
});
app.get('/api/posts/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM posts WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});
app.post('/api/posts', adminAuth, (req, res) => {
  const { title, slug, excerpt, content } = req.body;
  const published_at = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO posts (title, slug, excerpt, content, published_at) VALUES (?, ?, ?, ?, ?)');
  const info = stmt.run(title, slug, excerpt, content, published_at);
  res.json({ id: info.lastInsertRowid });
});
app.put('/api/posts/:id', adminAuth, (req, res) => {
  const { title, slug, excerpt, content } = req.body;
  db.prepare('UPDATE posts SET title=?, slug=?, excerpt=?, content=? WHERE id=?').run(title, slug, excerpt, content, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/posts/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Projects endpoints (similar)
app.get('/api/projects', (req, res) => {
  const rows = db.prepare('SELECT id, title, slug, excerpt, image, link FROM projects ORDER BY created_at DESC').all();
  res.json(rows);
});
app.post('/api/projects', adminAuth, (req, res) => {
  const { title, slug, excerpt, content, image, link } = req.body;
  const created_at = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO projects (title, slug, excerpt, content, image, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const info = stmt.run(title, slug, excerpt, content, image, link, created_at);
  res.json({ id: info.lastInsertRowid });
});

// Upload endpoint
app.post('/api/upload', adminAuth, upload.single('file'), (req, res) => {
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Contact endpoint: send email using nodemailer
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'missing fields' });

  // Use SMTP or SendGrid via SMTP. If SENDGRID_API_KEY provided, use direct SendGrid transport via nodemailer-sendgrid-transport (not included),
  // so we default to SMTP using EMAIL_USER and EMAIL_PASS (set via env)
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.sendgrid.net',
    port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || 'apikey', // for SendGrid 'apikey'
      pass: process.env.EMAIL_PASS || process.env.SENDGRID_API_KEY || ''
    }
  });

  const mailOpts = {
    from: `"Website Contact" <${process.env.EMAIL_SENDER || 'noreply@example.com'}>`,
    to: process.env.CONTACT_RECEIVER || process.env.EMAIL_RECEIVER || 'you@example.com',
    subject: `Website contact from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p>${message.replace(/\n/g,'<br>')}</p>`
  };

  try {
    await transporter.sendMail(mailOpts);
    res.json({ ok: true });
  } catch (err) {
    console.error('sendMail error', err);
    res.status(500).json({ error: 'failed to send email' });
  }
});

// Fallback to index.html for unknown routes (allow SPA-ish behavior for project slugs)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server listening on', port));
