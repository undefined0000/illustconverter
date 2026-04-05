require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { router: authRouter } = require('./auth');
const { router: adminRouter } = require('./admin');
const imagesRouter = require('./images');
const { router: paymentRouter } = require('./payment');
const { getDefaultPromptSeed } = require('./novelai-config');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Stripe webhook needs raw body - must be before express.json()
app.post('/api/credit/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let stripe = null;

  if (webhookSecret) {
    try {
      stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    } catch (e) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }
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
    const db = require('./db');

    try {
      const applyCompletedCheckout = db.transaction((checkoutSession) => {
        const existingTransaction = db.prepare(
          'SELECT id, user_id, plan_id, credits_amount, status FROM transactions WHERE stripe_session_id = ?'
        ).get(checkoutSession.id);

        const userId = parsePositiveInt(checkoutSession.metadata?.user_id) ?? existingTransaction?.user_id ?? null;
        const planId = parsePositiveInt(checkoutSession.metadata?.plan_id) ?? existingTransaction?.plan_id ?? null;
        const credits = parsePositiveInt(checkoutSession.metadata?.credits) ?? existingTransaction?.credits_amount ?? null;

        if (!userId || !credits) {
          return { applied: false, reason: 'missing_metadata' };
        }

        if (!existingTransaction) {
          db.prepare(
            "INSERT INTO transactions (user_id, plan_id, credits_amount, type, stripe_session_id, status) VALUES (?, ?, ?, 'purchase', ?, 'completed')"
          ).run(userId, planId, credits, checkoutSession.id);
          db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(credits, userId);
          return { applied: true, userId, credits };
        }

        if (existingTransaction.status === 'completed') {
          return { applied: false, reason: 'already_completed', userId, credits };
        }

        const updated = db.prepare(
          "UPDATE transactions SET status = 'completed' WHERE id = ? AND status != 'completed'"
        ).run(existingTransaction.id);

        if (updated.changes === 0) {
          return { applied: false, reason: 'already_completed', userId, credits };
        }

        db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(credits, userId);
        return { applied: true, userId, credits };
      });

      const result = applyCompletedCheckout(session);
      if (result.applied) {
        console.log(`✅ Granted ${result.credits} credits to user ${result.userId}`);
      } else if (result.reason !== 'already_completed') {
        console.warn(`Skipping checkout completion for session ${session.id}: ${result.reason}`);
      }
    } catch (err) {
      console.error('Credit grant error:', err);
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

function ensureUser(db, bcrypt, { email, password, username, isAdmin = 0, credits = 0 }) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return false;
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (email, password, username, is_admin, credits) VALUES (?, ?, ?, ?, ?)'
  ).run(email, hashedPassword, username, isAdmin, credits);
  return true;
}

// Auto-seed bootstrap users on startup
(function seedBootstrapUsers() {
  try {
    const bcrypt = require('bcryptjs');
    const db = require('./db');
    const bootstrapUsers = [
      {
        email: process.env.ADMIN_EMAIL || 'admin@illustconverter.com',
        password: process.env.ADMIN_PASSWORD || 'admin123456',
        username: 'Admin',
        isAdmin: 1,
        credits: 999,
      },
      {
        email: process.env.DEMO_EMAIL || 'demo.user@illustconverter.com',
        password: process.env.DEMO_PASSWORD || 'user123456',
        username: process.env.DEMO_USERNAME || 'Demo User',
        isAdmin: 0,
        credits: Number.parseInt(process.env.DEMO_CREDITS || '20', 10) || 20,
      },
    ];

    for (const userConfig of bootstrapUsers) {
      const created = ensureUser(db, bcrypt, userConfig);
      if (created) {
        const label = userConfig.isAdmin ? 'Admin' : 'Demo';
        console.log(`✅ ${label} account auto-created: ${userConfig.email} (${userConfig.credits} credits)`);
      }
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

// Seed default preset
(function seedPrompts() {
  try {
    const db = require('./db');
    const count = db.prepare('SELECT COUNT(*) as c FROM prompts').get();
    if (count.c === 0) {
      const defaultPrompt = getDefaultPromptSeed();
      db.prepare(`
        INSERT INTO prompts (
          name, description, prompt, negative_prompt, strength, noise, sampler, steps, scale, model,
          quality_tags_enabled, uc_preset, character_prompts_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        defaultPrompt.name,
        defaultPrompt.description,
        defaultPrompt.prompt,
        defaultPrompt.negative_prompt,
        defaultPrompt.strength,
        defaultPrompt.noise,
        defaultPrompt.sampler,
        defaultPrompt.steps,
        defaultPrompt.scale,
        defaultPrompt.model,
        defaultPrompt.quality_tags_enabled,
        defaultPrompt.uc_preset,
        defaultPrompt.character_prompts_json
      );
      console.log('✅ Default prompt created');
    }
  } catch (err) {
    console.error('Seed prompts error:', err);
  }
})();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 IllustConverter Server running on http://localhost:${PORT}`);
});
