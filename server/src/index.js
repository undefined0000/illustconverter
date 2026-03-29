require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { router: authRouter } = require('./auth');
const { router: adminRouter } = require('./admin');
const imagesRouter = require('./images');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api', imagesRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend in production
const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDistPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Auto-seed admin on startup
(function seedAdmin() {
  try {
    const bcrypt = require('bcryptjs');
    const db = require('./db');
    const email = process.env.ADMIN_EMAIL || 'admin@illustconverter.com';
    const password = process.env.ADMIN_PASSWORD || 'admin123456';

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!existing) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      db.prepare(
        'INSERT INTO users (email, password, username, is_admin) VALUES (?, ?, ?, 1)'
      ).run(email, hashedPassword, 'Admin');
      console.log(`✅ Admin account auto-created: ${email}`);
    }
  } catch (err) {
    console.error('Auto-seed error:', err);
  }
})();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 IllustConverter Server running on http://localhost:${PORT}`);
});
