const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const db = require('./db');
const { authenticateToken } = require('./auth');
const { callInpaint } = require('./novelai');
const { FIXED_IMAGE_WIDTH, FIXED_IMAGE_HEIGHT } = require('./novelai-config');

const router = express.Router();

// Multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('画像ファイルのみアップロードできます'), false);
    }
  }
});

// Get available prompts (for regular users - name & description only)
router.get('/prompts', authenticateToken, (req, res) => {
  try {
    const prompts = db.prepare(
      'SELECT id, name, description FROM prompts WHERE is_active = 1 ORDER BY name ASC'
    ).all();
    res.json({ prompts });
  } catch (err) {
    console.error('Get prompts error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Inpaint endpoint
router.post('/inpaint', authenticateToken, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'mask', maxCount: 1 }
]), async (req, res) => {
  let creditReserved = false;
  let jobId = null;

  try {
    const { prompt_id } = req.body;
    if (!prompt_id) {
      return res.status(400).json({ error: '設定を選択してください' });
    }

    // Validate files
    if (!req.files || !req.files.image || !req.files.mask) {
      return res.status(400).json({ error: '画像とマスクの両方が必要です' });
    }

    // Get prompt config
    const promptConfig = db.prepare('SELECT * FROM prompts WHERE id = ? AND is_active = 1').get(prompt_id);
    if (!promptConfig) {
      return res.status(404).json({ error: '選択した設定が見つかりません' });
    }

    // Process image - ensure it's the fixed Opus-free portrait size
    const imageBuffer = await sharp(req.files.image[0].buffer)
      .resize(FIXED_IMAGE_WIDTH, FIXED_IMAGE_HEIGHT, { fit: 'fill' })
      .png()
      .toBuffer();

    // Process mask - ensure it's the fixed Opus-free portrait size
    const maskBuffer = await sharp(req.files.mask[0].buffer)
      .resize(FIXED_IMAGE_WIDTH, FIXED_IMAGE_HEIGHT, { fit: 'fill' })
      .png()
      .toBuffer();

    // Convert to base64
    const imageBase64 = imageBuffer.toString('base64');
    const maskBase64 = maskBuffer.toString('base64');

    const reserved = db.prepare(
      'UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0'
    ).run(req.user.id);

    if (reserved.changes === 0) {
      return res.status(402).json({ error: 'クレジットが不足しています。クレジットを購入してください。', need_credits: true });
    }

    creditReserved = true;

    // Create job record
    const job = db.prepare(
      'INSERT INTO jobs (user_id, prompt_id, status) VALUES (?, ?, ?)'
    ).run(req.user.id, prompt_id, 'processing');
    jobId = job.lastInsertRowid;

    try {
      // Call NovelAI API
      const resultBuffer = await callInpaint(imageBase64, maskBase64, promptConfig);

      // Update job with result
      const resultBase64 = resultBuffer.toString('base64');
      db.prepare('UPDATE jobs SET status = ?, result_image = ? WHERE id = ?')
        .run('completed', resultBase64, jobId);

      const updatedUser = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);
      creditReserved = false;

      res.json({
        success: true,
        job_id: jobId,
        remaining_credits: updatedUser.credits,
        image: `data:image/png;base64,${resultBase64}`
      });
    } catch (apiError) {
      if (jobId) {
        db.prepare('UPDATE jobs SET status = ? WHERE id = ?')
          .run('failed', jobId);
      }
      if (creditReserved) {
        db.prepare('UPDATE users SET credits = credits + 1 WHERE id = ?').run(req.user.id);
        creditReserved = false;
      }
      console.error('Upstream image processing error:', apiError);
      res.status(502).json({ error: '処理に失敗しました。時間をおいて再度お試しください。' });
    }
  } catch (err) {
    if (creditReserved) {
      db.prepare('UPDATE users SET credits = credits + 1 WHERE id = ?').run(req.user.id);
    }
    if (jobId) {
      db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('failed', jobId);
    }
    console.error('Inpaint error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Get job history
router.get('/jobs', authenticateToken, (req, res) => {
  try {
    const jobs = db.prepare(`
      SELECT j.id, j.status, j.created_at, p.name as prompt_name
      FROM jobs j
      LEFT JOIN prompts p ON j.prompt_id = p.id
      WHERE j.user_id = ?
      ORDER BY j.created_at DESC
      LIMIT 20
    `).all(req.user.id);
    res.json({ jobs });
  } catch (err) {
    console.error('Get jobs error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// Get job result image
router.get('/jobs/:id/image', authenticateToken, (req, res) => {
  try {
    const job = db.prepare(
      'SELECT result_image FROM jobs WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!job || !job.result_image) {
      return res.status(404).json({ error: '画像が見つかりません' });
    }

    const imgBuffer = Buffer.from(job.result_image, 'base64');
    res.set('Content-Type', 'image/png');
    res.send(imgBuffer);
  } catch (err) {
    console.error('Get job image error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

module.exports = router;
