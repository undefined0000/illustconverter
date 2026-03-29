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

module.exports = { router, requireAdmin };
