const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();

let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (e) {
  console.warn('⚠️ Stripe not configured');
}

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Get credit balance
router.get('/balance', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);
    res.json({ credits: user?.credits || 0 });
  } catch (err) {
    console.error('Get balance error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Get available credit plans
router.get('/plans', (req, res) => {
  try {
    const plans = db.prepare(
      'SELECT id, name, description, credits, price_yen FROM credit_plans WHERE is_active = 1 ORDER BY sort_order ASC, price_yen ASC'
    ).all();
    res.json({ plans });
  } catch (err) {
    console.error('Get plans error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Create Stripe Checkout session
router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe決済が設定されていません。管理者に連絡してください。' });
    }

    const { plan_id } = req.body;
    if (!plan_id) {
      return res.status(400).json({ error: 'プランを選択してください' });
    }

    const plan = db.prepare('SELECT * FROM credit_plans WHERE id = ? AND is_active = 1').get(plan_id);
    if (!plan) {
      return res.status(404).json({ error: 'プランが見つかりません' });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: {
            name: `${plan.name} (${plan.credits} クレジット)`,
            description: plan.description || `IllustConverter ${plan.credits} クレジットパック`,
          },
          unit_amount: plan.price_yen,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${APP_URL}/#/credits?status=success`,
      cancel_url: `${APP_URL}/#/credits?status=cancel`,
      metadata: {
        user_id: req.user.id.toString(),
        plan_id: plan.id.toString(),
        credits: plan.credits.toString(),
      },
    });

    // Record pending transaction
    db.prepare(
      'INSERT INTO transactions (user_id, plan_id, credits_amount, type, stripe_session_id, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, plan.id, plan.credits, 'purchase', session.id, 'pending');

    res.json({ checkout_url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: `決済エラー: ${err.message}` });
  }
});

// Get purchase history
router.get('/history', authenticateToken, (req, res) => {
  try {
    const transactions = db.prepare(`
      SELECT t.id, t.credits_amount, t.type, t.status, t.created_at,
             cp.name as plan_name, cp.price_yen
      FROM transactions t
      LEFT JOIN credit_plans cp ON t.plan_id = cp.id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
      LIMIT 50
    `).all(req.user.id);
    res.json({ transactions });
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

module.exports = { router, stripe };
