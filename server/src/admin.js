const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth');
const {
  FIXED_NOVELAI_MODEL,
  DEFAULT_STRENGTH,
  DEFAULT_NOISE,
  DEFAULT_SAMPLER,
  DEFAULT_STEPS,
  MAX_FREE_STEPS,
  DEFAULT_SCALE,
  DEFAULT_UC_PRESET,
  VALID_SAMPLERS,
  UC_PRESETS,
  serializeCharacterPrompts,
  serializePromptRecord,
} = require('./novelai-config');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: '管理者権限が必要です' });
  }

  next();
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function toFlag(value, fallback = 0) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (value === 1 || value === '1' || value === 'true') {
    return 1;
  }

  if (value === 0 || value === '0' || value === 'false') {
    return 0;
  }

  return fallback;
}

function normalizeUcPreset(value, fallback = DEFAULT_UC_PRESET) {
  return Object.prototype.hasOwnProperty.call(UC_PRESETS, value) ? value : fallback;
}

function normalizeSampler(value, fallback = DEFAULT_SAMPLER) {
  return VALID_SAMPLERS.has(value) ? value : fallback;
}

function normalizePromptPayload(body, existingPrompt = {}) {
  return {
    name: String(body.name ?? existingPrompt.name ?? '').trim(),
    description: String(body.description ?? existingPrompt.description ?? '').trim(),
    prompt: String(body.prompt ?? existingPrompt.prompt ?? '').trim(),
    negative_prompt: String(body.negative_prompt ?? existingPrompt.negative_prompt ?? '').trim(),
    strength: clampNumber(body.strength ?? existingPrompt.strength, DEFAULT_STRENGTH, 0, 1),
    noise: clampNumber(body.noise ?? existingPrompt.noise, DEFAULT_NOISE, 0, 1),
    sampler: normalizeSampler(body.sampler, existingPrompt.sampler || DEFAULT_SAMPLER),
    steps: Math.round(clampNumber(body.steps ?? existingPrompt.steps, DEFAULT_STEPS, 1, MAX_FREE_STEPS)),
    scale: clampNumber(body.scale ?? existingPrompt.scale, DEFAULT_SCALE, 0, 20),
    model: FIXED_NOVELAI_MODEL,
    quality_tags_enabled: toFlag(body.quality_tags_enabled, Number(existingPrompt.quality_tags_enabled ?? 1)),
    uc_preset: normalizeUcPreset(body.uc_preset, existingPrompt.uc_preset || DEFAULT_UC_PRESET),
    character_prompts_json: serializeCharacterPrompts(body.character_prompts ?? existingPrompt.character_prompts_json ?? []),
    is_active: toFlag(body.is_active, Number(existingPrompt.is_active ?? 1)),
  };
}

router.get('/prompts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const prompts = (await db.all('SELECT * FROM prompts ORDER BY created_at DESC'))
      .map(serializePromptRecord);

    res.json({ prompts });
  } catch (error) {
    console.error('Get prompts error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.post('/prompts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const payload = normalizePromptPayload(req.body);
    if (!payload.name || !payload.prompt) {
      return res.status(400).json({ error: 'プリセット名と内部設定は必須です' });
    }

    const result = await db.run(
      `INSERT INTO prompts (
        name, description, prompt, negative_prompt, strength, noise, sampler, steps, scale, model,
        quality_tags_enabled, uc_preset, character_prompts_json, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        payload.name,
        payload.description,
        payload.prompt,
        payload.negative_prompt,
        payload.strength,
        payload.noise,
        payload.sampler,
        payload.steps,
        payload.scale,
        payload.model,
        payload.quality_tags_enabled,
        payload.uc_preset,
        payload.character_prompts_json,
        payload.is_active,
      ]
    );

    const prompt = serializePromptRecord(
      await db.get('SELECT * FROM prompts WHERE id = $1', [result.lastInsertRowid])
    );
    res.json({ prompt });
  } catch (error) {
    console.error('Create prompt error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.put('/prompts/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT * FROM prompts WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'プリセットが見つかりません' });
    }

    const payload = normalizePromptPayload(req.body, existing);
    if (!payload.name || !payload.prompt) {
      return res.status(400).json({ error: 'プリセット名と内部設定は必須です' });
    }

    await db.run(
      `UPDATE prompts SET
        name = $1,
        description = $2,
        prompt = $3,
        negative_prompt = $4,
        strength = $5,
        noise = $6,
        sampler = $7,
        steps = $8,
        scale = $9,
        model = $10,
        quality_tags_enabled = $11,
        uc_preset = $12,
        character_prompts_json = $13,
        is_active = $14,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $15`,
      [
        payload.name,
        payload.description,
        payload.prompt,
        payload.negative_prompt,
        payload.strength,
        payload.noise,
        payload.sampler,
        payload.steps,
        payload.scale,
        payload.model,
        payload.quality_tags_enabled,
        payload.uc_preset,
        payload.character_prompts_json,
        payload.is_active,
        id,
      ]
    );

    const prompt = serializePromptRecord(await db.get('SELECT * FROM prompts WHERE id = $1', [id]));
    res.json({ prompt });
  } catch (error) {
    console.error('Update prompt error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.delete('/prompts/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT id FROM prompts WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'プリセットが見つかりません' });
    }

    await db.run('DELETE FROM prompts WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete prompt error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.get('/plans', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const plans = await db.all('SELECT * FROM credit_plans ORDER BY sort_order ASC, id ASC');
    res.json({ plans });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.post('/plans', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, credits, price_yen, sort_order } = req.body;
    if (!name || !credits || !price_yen) {
      return res.status(400).json({ error: 'プラン名、クレジット数、金額は必須です' });
    }

    const result = await db.run(
      `INSERT INTO credit_plans (name, description, credits, price_yen, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name, description || '', credits, price_yen, sort_order ?? 0]
    );

    const plan = await db.get('SELECT * FROM credit_plans WHERE id = $1', [result.lastInsertRowid]);
    res.json({ plan });
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.put('/plans/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT * FROM credit_plans WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'プランが見つかりません' });
    }

    const {
      name,
      description,
      credits,
      price_yen,
      is_active,
      sort_order,
      stripe_price_id,
    } = req.body;

    await db.run(
      `UPDATE credit_plans SET
        name = $1,
        description = $2,
        credits = $3,
        price_yen = $4,
        is_active = $5,
        sort_order = $6,
        stripe_price_id = $7
      WHERE id = $8`,
      [
        name ?? existing.name,
        description ?? existing.description,
        credits ?? existing.credits,
        price_yen ?? existing.price_yen,
        is_active ?? existing.is_active,
        sort_order ?? existing.sort_order,
        stripe_price_id ?? existing.stripe_price_id,
        id,
      ]
    );

    const plan = await db.get('SELECT * FROM credit_plans WHERE id = $1', [id]);
    res.json({ plan });
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.delete('/plans/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM credit_plans WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.all(
      'SELECT id, email, username, is_admin, credits, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.post('/users/:id/grant', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { credits } = req.body;

    if (!credits || credits < 1) {
      return res.status(400).json({ error: '1以上のクレジット数を指定してください' });
    }

    const user = await db.get('SELECT id FROM users WHERE id = $1', [id]);
    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    await db.run('UPDATE users SET credits = credits + $1 WHERE id = $2', [credits, id]);
    await db.run(
      "INSERT INTO transactions (user_id, credits_amount, type, status) VALUES ($1, $2, 'admin_grant', 'completed')",
      [id, credits]
    );

    const updatedUser = await db.get(
      'SELECT id, email, username, credits FROM users WHERE id = $1',
      [id]
    );
    res.json({ user: updatedUser });
  } catch (error) {
    console.error('Grant credits error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

module.exports = { router, requireAdmin };
