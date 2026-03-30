require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { router: authRouter } = require('./auth');
const { router: adminRouter } = require('./admin');
const imagesRouter = require('./images');
const { router: paymentRouter } = require('./payment');

const app = express();
const PORT = process.env.PORT || 3000;

// Stripe webhook needs raw body - must be before express.json()
app.post('/api/credit/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let stripe;
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  } catch (e) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  let event;
  try {
    if (webhookSecret) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = parseInt(session.metadata.user_id);
    const planId = parseInt(session.metadata.plan_id);
    const credits = parseInt(session.metadata.credits);

    if (userId && credits) {
      const db = require('./db');
      try {
        // Grant credits
        db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(credits, userId);
        // Update transaction status
        db.prepare("UPDATE transactions SET status = 'completed' WHERE stripe_session_id = ?").run(session.id);
        console.log(`✅ Granted ${credits} credits to user ${userId}`);
      } catch (err) {
        console.error('Credit grant error:', err);
      }
    }
  }

  res.json({ received: true });
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/credit', paymentRouter);
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
        'INSERT INTO users (email, password, username, is_admin, credits) VALUES (?, ?, ?, 1, 999)'
      ).run(email, hashedPassword, 'Admin');
      console.log(`✅ Admin account auto-created: ${email} (999 credits)`);
    }
  } catch (err) {
    console.error('Auto-seed error:', err);
  }
})();

// Seed default credit plans
(function seedPlans() {
  try {
    const db = require('./db');
    const count = db.prepare('SELECT COUNT(*) as c FROM credit_plans').get();
    if (count.c === 0) {
      const insert = db.prepare('INSERT INTO credit_plans (name, description, credits, price_yen, sort_order) VALUES (?, ?, ?, ?, ?)');
      insert.run('お試しパック', '初めての方におすすめ', 5, 500, 1);
      insert.run('スタンダード', '一番人気のプラン', 20, 1500, 2);
      insert.run('プレミアム', 'たっぷり使えるお得パック', 50, 3000, 3);
      console.log('✅ Default credit plans created');
    }
  } catch (err) {
    console.error('Seed plans error:', err);
  }
})();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 IllustConverter Server running on http://localhost:${PORT}`);
});
