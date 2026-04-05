const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();

let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (error) {
  console.warn('Stripe not configured');
}

function getAppUrl(req) {
  const configuredUrl = process.env.APP_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  return `${req.protocol}://${req.get('host')}`;
}

router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT credits FROM users WHERE id = $1', [req.user.id]);
    res.json({ credits: user?.credits || 0 });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.get('/plans', async (req, res) => {
  try {
    const plans = await db.all(
      `SELECT id, name, description, credits, price_yen
       FROM credit_plans
       WHERE is_active = 1
       ORDER BY sort_order ASC, price_yen ASC`
    );

    res.json({ plans });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: '決済機能はまだ設定されていません。管理者に連絡してください。' });
    }

    const { plan_id: planId } = req.body;
    if (!planId) {
      return res.status(400).json({ error: 'プランを選択してください' });
    }

    const plan = await db.get(
      'SELECT * FROM credit_plans WHERE id = $1 AND is_active = 1',
      [planId]
    );
    if (!plan) {
      return res.status(404).json({ error: 'プランが見つかりません' });
    }

    const appUrl = getAppUrl(req);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: {
              name: `${plan.name} (${plan.credits} クレジット)`,
              description: plan.description || `IllustConverter ${plan.credits} クレジットパック`,
            },
            unit_amount: plan.price_yen,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${appUrl}/#/credits?status=success`,
      cancel_url: `${appUrl}/#/credits?status=cancel`,
      metadata: {
        user_id: req.user.id.toString(),
        plan_id: plan.id.toString(),
        credits: plan.credits.toString(),
      },
    });

    await db.run(
      `INSERT INTO transactions (user_id, plan_id, credits_amount, type, stripe_session_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, plan.id, plan.credits, 'purchase', session.id, 'pending']
    );

    res.json({ checkout_url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: `決済エラー: ${error.message}` });
  }
});

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const transactions = await db.all(
      `SELECT t.id, t.credits_amount, t.type, t.status, t.created_at,
              cp.name AS plan_name, cp.price_yen
       FROM transactions t
       LEFT JOIN credit_plans cp ON t.plan_id = cp.id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    res.json({ transactions });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

module.exports = { router, stripe };
