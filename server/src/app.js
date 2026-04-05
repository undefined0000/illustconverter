require('./load-env');
const express = require('express');
const cors = require('cors');
const { router: authRouter } = require('./auth');
const { router: adminRouter } = require('./admin');
const imagesRouter = require('./images');
const { router: paymentRouter } = require('./payment');
const { initializeAppData, applyCompletedCheckout } = require('./bootstrap');

const app = express();
const ready = initializeAppData();

app.set('trust proxy', true);

app.use(cors());

app.post('/api/credit/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    await ready;
  } catch (error) {
    console.error('App initialization error:', error);
    return res.status(500).json({ error: 'Server initialization failed' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let stripe = null;

  if (webhookSecret) {
    try {
      stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    } catch (error) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }
  }

  let event;
  try {
    if (webhookSecret) {
      const signature = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const result = await applyCompletedCheckout(session);
      if (result.applied) {
        console.log(`[webhook] Granted ${result.credits} credits to user ${result.userId}`);
      } else if (result.reason !== 'already_completed') {
        console.warn(`[webhook] Skipping checkout completion for ${session.id}: ${result.reason}`);
      }
    } catch (error) {
      console.error('Credit grant error:', error);
    }
  }

  res.json({ received: true });
});

app.use(async (req, res, next) => {
  try {
    await ready;
    next();
  } catch (error) {
    console.error('App initialization error:', error);
    res.status(500).json({ error: 'Server initialization failed' });
  }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/credit', paymentRouter);
app.use('/api', imagesRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: '送信サイズが大きすぎます' });
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: '不正なリクエストです' });
  }

  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'サーバーエラーが発生しました' });
});

module.exports = { app, ready };
