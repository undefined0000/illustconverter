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

// Admin middleware
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

// Get all prompts (admin)
router.get('/prompts', authenticateToken, requireAdmin, (req, res) => {
  try {
    const prompts = db.prepare('SELECT * FROM prompts ORDER BY created_at DESC').all()
      .map(serializePromptRecord);
    res.json({ prompts });
  } catch (err) {
    console.error('Get prompts error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Create prompt
router.post('/prompts', authenticateToken, requireAdmin, (req, res) => {
  try {
    const payload = normalizePromptPayload(req.body);
    if (!payload.name || !payload.prompt) {
      return res.status(400).json({ error: 'プロンプト名とプロンプトは必須です' });
    }

    const result = db.prepare(`
      INSERT INTO prompts (
        name, description, prompt, negative_prompt, strength, noise, sampler, steps, scale, model,
        quality_tags_enabled, uc_preset, character_prompts_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
      payload.character_prompts_json
    );

    const newPrompt = serializePromptRecord(
      db.prepare('SELECT * FROM prompts WHERE id = ?').get(result.lastInsertRowid)
    );
    res.json({ prompt: newPrompt });
  } catch (err) {
    console.error('Create prompt error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Update prompt
router.put('/prompts/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'プロンプトが見つかりません' });
    }

    const payload = normalizePromptPayload(req.body, existing);
    if (!payload.name || !payload.prompt) {
      return res.status(400).json({ error: 'プロンプト名とプロンプトは必須です' });
    }

    db.prepare(`
      UPDATE prompts SET
        name = ?, description = ?, prompt = ?, negative_prompt = ?,
        strength = ?, noise = ?, sampler = ?, steps = ?, scale = ?, model = ?,
        quality_tags_enabled = ?, uc_preset = ?, character_prompts_json = ?,
        is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
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
      id
    );

    const updated = serializePromptRecord(
      db.prepare('SELECT * FROM prompts WHERE id = ?').get(id)
    );
    res.json({ prompt: updated });
  } catch (err) {
    console.error('Update prompt error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Delete prompt
router.delete('/prompts/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'プロンプトが見つかりません' });
    }

    db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete prompt error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// =========================================
// Credit Plan Management
// =========================================

// Get all credit plans (admin)
router.get('/plans', authenticateToken, requireAdmin, (req, res) => {
  try {
    const plans = db.prepare('SELECT * FROM credit_plans ORDER BY sort_order ASC').all();
    res.json({ plans });
  } catch (err) {
    console.error('Get plans error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Create credit plan
router.post('/plans', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { name, description, credits, price_yen, sort_order } = req.body;
    if (!name || !credits || !price_yen) {
      return res.status(400).json({ error: 'プラン名、クレジット数、価格は必須です' });
    }

    const result = db.prepare(
      'INSERT INTO credit_plans (name, description, credits, price_yen, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(name, description || '', credits, price_yen, sort_order ?? 0);

    const plan = db.prepare('SELECT * FROM credit_plans WHERE id = ?').get(result.lastInsertRowid);
    res.json({ plan });
  } catch (err) {
    console.error('Create plan error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Update credit plan
router.put('/plans/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, credits, price_yen, is_active, sort_order } = req.body;
    const existing = db.prepare('SELECT * FROM credit_plans WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'プランが見つかりません' });

    db.prepare(
      'UPDATE credit_plans SET name=?, description=?, credits=?, price_yen=?, is_active=?, sort_order=? WHERE id=?'
    ).run(
      name ?? existing.name, description ?? existing.description,
      credits ?? existing.credits, price_yen ?? existing.price_yen,
      is_active ?? existing.is_active, sort_order ?? existing.sort_order, id
    );

    const updated = db.prepare('SELECT * FROM credit_plans WHERE id = ?').get(id);
    res.json({ plan: updated });
  } catch (err) {
    console.error('Update plan error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Delete credit plan
router.delete('/plans/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM credit_plans WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete plan error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// =========================================
// User Management (admin)
// =========================================

// Get all users
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT id, email, username, is_admin, credits, created_at FROM users ORDER BY created_at DESC').all();
    res.json({ users });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Grant credits to user
router.post('/users/:id/grant', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { credits } = req.body;
    if (!credits || credits < 1) {
      return res.status(400).json({ error: '1以上のクレジット数を指定してください' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });

    db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(credits, id);

    // Record transaction
    db.prepare(
      "INSERT INTO transactions (user_id, credits_amount, type, status) VALUES (?, ?, 'admin_grant', 'completed')"
    ).run(id, credits);

    const updated = db.prepare('SELECT id, email, username, credits FROM users WHERE id = ?').get(id);
    res.json({ user: updated });
  } catch (err) {
    console.error('Grant credits error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

module.exports = { router, requireAdmin };

