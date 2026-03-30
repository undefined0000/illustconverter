const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();

// Admin middleware
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: '管理者権限が必要です' });
  }
  next();
}

// Get all prompts (admin)
router.get('/prompts', authenticateToken, requireAdmin, (req, res) => {
  try {
    const prompts = db.prepare('SELECT * FROM prompts ORDER BY created_at DESC').all();
    res.json({ prompts });
  } catch (err) {
    console.error('Get prompts error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Create prompt
router.post('/prompts', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { name, description, prompt, negative_prompt, strength, noise, sampler, steps, scale, model } = req.body;
    if (!name || !prompt) {
      return res.status(400).json({ error: 'プロンプト名とプロンプトは必須です' });
    }

    const result = db.prepare(`
      INSERT INTO prompts (name, description, prompt, negative_prompt, strength, noise, sampler, steps, scale, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      description || '',
      prompt,
      negative_prompt || '',
      strength ?? 0.7,
      noise ?? 0.0,
      sampler || 'k_euler',
      steps ?? 28,
      scale ?? 5.0,
      model || 'nai-diffusion-3'
    );

    const newPrompt = db.prepare('SELECT * FROM prompts WHERE id = ?').get(result.lastInsertRowid);
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
    const { name, description, prompt, negative_prompt, strength, noise, sampler, steps, scale, model, is_active } = req.body;

    const existing = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'プロンプトが見つかりません' });
    }

    db.prepare(`
      UPDATE prompts SET
        name = ?, description = ?, prompt = ?, negative_prompt = ?,
        strength = ?, noise = ?, sampler = ?, steps = ?, scale = ?, model = ?,
        is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name ?? existing.name,
      description ?? existing.description,
      prompt ?? existing.prompt,
      negative_prompt ?? existing.negative_prompt,
      strength ?? existing.strength,
      noise ?? existing.noise,
      sampler ?? existing.sampler,
      steps ?? existing.steps,
      scale ?? existing.scale,
      model ?? existing.model,
      is_active ?? existing.is_active,
      id
    );

    const updated = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
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

