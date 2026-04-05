const express = require('express');
const multer = require('multer');
const db = require('./db');
const { authenticateToken } = require('./auth');
const { callInpaint } = require('./novelai');
const { FIXED_IMAGE_WIDTH, FIXED_IMAGE_HEIGHT } = require('./novelai-config');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }

    cb(new Error('画像ファイルのみアップロードできます'), false);
  },
});

router.get('/prompts', authenticateToken, async (req, res) => {
  try {
    const prompts = await db.all(
      'SELECT id, name, description FROM prompts WHERE is_active = 1 ORDER BY name ASC'
    );
    res.json({ prompts });
  } catch (error) {
    console.error('Get prompts error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.post(
  '/inpaint',
  authenticateToken,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'mask', maxCount: 1 },
  ]),
  async (req, res) => {
    let creditReserved = false;
    let jobId = null;

    try {
      const { prompt_id: promptId } = req.body;
      if (!promptId) {
        return res.status(400).json({ error: '設定を選択してください' });
      }

      if (!req.files?.image || !req.files?.mask) {
        return res.status(400).json({ error: '画像とマスクの両方が必要です' });
      }

      const promptConfig = await db.get(
        'SELECT * FROM prompts WHERE id = $1 AND is_active = 1',
        [promptId]
      );
      if (!promptConfig) {
        return res.status(404).json({ error: '選択した設定が見つかりません' });
      }

      const sharp = require('sharp');
      const imageBuffer = await sharp(req.files.image[0].buffer)
        .resize(FIXED_IMAGE_WIDTH, FIXED_IMAGE_HEIGHT, { fit: 'fill' })
        .png()
        .toBuffer();

      const maskBuffer = await sharp(req.files.mask[0].buffer)
        .resize(FIXED_IMAGE_WIDTH, FIXED_IMAGE_HEIGHT, { fit: 'fill' })
        .png()
        .toBuffer();

      const imageBase64 = imageBuffer.toString('base64');
      const maskBase64 = maskBuffer.toString('base64');

      const reserved = await db.run(
        'UPDATE users SET credits = credits - 1 WHERE id = $1 AND credits > 0 RETURNING credits',
        [req.user.id]
      );

      if (reserved.changes === 0) {
        return res.status(402).json({
          error: 'クレジットが不足しています。クレジットを購入してください。',
          need_credits: true,
        });
      }

      creditReserved = true;

      const job = await db.run(
        'INSERT INTO jobs (user_id, prompt_id, status) VALUES ($1, $2, $3) RETURNING id',
        [req.user.id, promptId, 'processing']
      );
      jobId = job.lastInsertRowid;

      try {
        const resultBuffer = await callInpaint(imageBase64, maskBase64, promptConfig);
        const resultBase64 = resultBuffer.toString('base64');

        await db.run(
          'UPDATE jobs SET status = $1, result_image = $2 WHERE id = $3',
          ['completed', resultBase64, jobId]
        );

        const updatedUser = await db.get('SELECT credits FROM users WHERE id = $1', [req.user.id]);
        creditReserved = false;

        res.json({
          success: true,
          job_id: jobId,
          remaining_credits: updatedUser?.credits ?? 0,
          image: `data:image/png;base64,${resultBase64}`,
        });
      } catch (apiError) {
        if (jobId) {
          await db.run('UPDATE jobs SET status = $1 WHERE id = $2', ['failed', jobId]);
        }

        if (creditReserved) {
          await db.run('UPDATE users SET credits = credits + 1 WHERE id = $1', [req.user.id]);
          creditReserved = false;
        }

        console.error('Upstream image processing error:', apiError);
        res.status(502).json({ error: '処理に失敗しました。時間をおいて再度お試しください。' });
      }
    } catch (error) {
      if (creditReserved) {
        await db.run('UPDATE users SET credits = credits + 1 WHERE id = $1', [req.user.id]);
      }

      if (jobId) {
        await db.run('UPDATE jobs SET status = $1 WHERE id = $2', ['failed', jobId]);
      }

      console.error('Inpaint error:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  }
);

router.get('/jobs', authenticateToken, async (req, res) => {
  try {
    const jobs = await db.all(
      `SELECT j.id, j.status, j.created_at, p.name AS prompt_name
       FROM jobs j
       LEFT JOIN prompts p ON j.prompt_id = p.id
       WHERE j.user_id = $1
       ORDER BY j.created_at DESC
       LIMIT 20`,
      [req.user.id]
    );

    res.json({ jobs });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

router.get('/jobs/:id/image', authenticateToken, async (req, res) => {
  try {
    const job = await db.get(
      'SELECT result_image FROM jobs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (!job?.result_image) {
      return res.status(404).json({ error: '画像が見つかりません' });
    }

    res.set('Content-Type', 'image/png');
    res.send(Buffer.from(job.result_image, 'base64'));
  } catch (error) {
    console.error('Get job image error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

module.exports = router;
