const bcrypt = require('bcryptjs');
const db = require('./db');
const { getDefaultPromptSeed } = require('./novelai-config');

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readEnvValue(name, fallback) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function ensureUser({ email, password, username, isAdmin = 0, credits = 0 }) {
  const existing = await db.get('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) {
    return false;
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  await db.run(
    'INSERT INTO users (email, password, username, is_admin, credits) VALUES ($1, $2, $3, $4, $5)',
    [email, hashedPassword, username, isAdmin, credits]
  );
  return true;
}

async function seedBootstrapUsers() {
  const bootstrapUsers = [
    {
      email: readEnvValue('ADMIN_EMAIL', 'admin@illustconverter.com'),
      password: readEnvValue('ADMIN_PASSWORD', 'admin123456'),
      username: 'Admin',
      isAdmin: 1,
      credits: 999,
    },
    {
      email: readEnvValue('DEMO_EMAIL', 'demo.user@illustconverter.com'),
      password: readEnvValue('DEMO_PASSWORD', 'user123456'),
      username: readEnvValue('DEMO_USERNAME', 'Demo User'),
      isAdmin: 0,
      credits: Number.parseInt(readEnvValue('DEMO_CREDITS', '20'), 10) || 20,
    },
  ];

  for (const userConfig of bootstrapUsers) {
    const created = await ensureUser(userConfig);
    if (created) {
      const label = userConfig.isAdmin ? 'Admin' : 'Demo';
      console.log(`[bootstrap] ${label} account created: ${userConfig.email}`);
    }
  }
}

async function seedPlans() {
  const count = await db.get('SELECT COUNT(*)::int AS c FROM credit_plans');
  if (count?.c > 0) {
    return;
  }

  const plans = [
    ['お試しパック', '初めての方におすすめ', 5, 500, 1],
    ['スタンダード', '一番人気のプラン', 20, 1500, 2],
    ['プレミアム', 'たっぷり使えるお得パック', 50, 3000, 3],
  ];

  for (const plan of plans) {
    await db.run(
      'INSERT INTO credit_plans (name, description, credits, price_yen, sort_order) VALUES ($1, $2, $3, $4, $5)',
      plan
    );
  }

  console.log('[bootstrap] Default credit plans created');
}

async function seedPrompts() {
  const count = await db.get('SELECT COUNT(*)::int AS c FROM prompts');
  if (count?.c > 0) {
    return;
  }

  const defaultPrompt = getDefaultPromptSeed();
  await db.run(
    `INSERT INTO prompts (
      name, description, prompt, negative_prompt, strength, noise, sampler, steps, scale, model,
      quality_tags_enabled, uc_preset, character_prompts_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
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
      defaultPrompt.character_prompts_json,
    ]
  );

  console.log('[bootstrap] Default preset created');
}

async function applyCompletedCheckout(checkoutSession) {
  return db.transaction(async (tx) => {
    const existingTransaction = await tx.get(
      'SELECT id, user_id, plan_id, credits_amount, status FROM transactions WHERE stripe_session_id = $1',
      [checkoutSession.id]
    );

    const userId = parsePositiveInt(checkoutSession.metadata?.user_id) ?? existingTransaction?.user_id ?? null;
    const planId = parsePositiveInt(checkoutSession.metadata?.plan_id) ?? existingTransaction?.plan_id ?? null;
    const credits = parsePositiveInt(checkoutSession.metadata?.credits) ?? existingTransaction?.credits_amount ?? null;

    if (!userId || !credits) {
      return { applied: false, reason: 'missing_metadata' };
    }

    if (!existingTransaction) {
      await tx.run(
        "INSERT INTO transactions (user_id, plan_id, credits_amount, type, stripe_session_id, status) VALUES ($1, $2, $3, 'purchase', $4, 'completed')",
        [userId, planId, credits, checkoutSession.id]
      );
      await tx.run('UPDATE users SET credits = credits + $1 WHERE id = $2', [credits, userId]);
      return { applied: true, userId, credits };
    }

    if (existingTransaction.status === 'completed') {
      return { applied: false, reason: 'already_completed', userId, credits };
    }

    const updated = await tx.run(
      "UPDATE transactions SET status = 'completed' WHERE id = $1 AND status <> 'completed'",
      [existingTransaction.id]
    );

    if (updated.changes === 0) {
      return { applied: false, reason: 'already_completed', userId, credits };
    }

    await tx.run('UPDATE users SET credits = credits + $1 WHERE id = $2', [credits, userId]);
    return { applied: true, userId, credits };
  });
}

let initializeAppDataPromise = null;

async function initializeAppData() {
  if (!initializeAppDataPromise) {
    const promise = (async () => {
      await db.initialize();
      await seedBootstrapUsers();
      await seedPlans();
      await seedPrompts();
    })();

    initializeAppDataPromise = promise.catch((error) => {
      initializeAppDataPromise = null;
      throw error;
    });
  }

  return initializeAppDataPromise;
}

module.exports = {
  initializeAppData,
  applyCompletedCheckout,
};
