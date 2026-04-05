const https = require('https');
const zlib = require('zlib');
const {
  FIXED_NOVELAI_MODEL,
  FIXED_IMAGE_WIDTH,
  FIXED_IMAGE_HEIGHT,
  DEFAULT_STRENGTH,
  DEFAULT_NOISE,
  DEFAULT_SAMPLER,
  DEFAULT_STEPS,
  DEFAULT_SCALE,
  DEFAULT_UC_PRESET,
  buildPromptInput,
  buildNegativePrompt,
} = require('./novelai-config');

const NOVELAI_API_URL = 'https://image.novelai.net/ai/generate-image';

function numberOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Call NovelAI inpaint API
 * @param {string} imageBase64 - Base64 encoded source image (no data URI prefix)
 * @param {string} maskBase64 - Base64 encoded mask image (white=inpaint, black=keep)
 * @param {object} promptConfig - Prompt configuration from DB
 * @returns {Promise<Buffer>} - Result image as Buffer
 */
async function callInpaint(imageBase64, maskBase64, promptConfig) {
  const token = process.env.NOVELAI_TOKEN?.trim() || process.env.NOVELAI_API_TOKEN?.trim();
  if (!token || token === 'your_novelai_api_token_here') {
    throw new Error('NovelAI token is not configured');
  }

  const payload = JSON.stringify({
    input: buildPromptInput(
      promptConfig.prompt,
      promptConfig.character_prompts_json ?? promptConfig.character_prompts,
      Number(promptConfig.quality_tags_enabled ?? 1) !== 0
    ),
    model: FIXED_NOVELAI_MODEL,
    action: 'img2img',
    parameters: {
      width: FIXED_IMAGE_WIDTH,
      height: FIXED_IMAGE_HEIGHT,
      scale: numberOrFallback(promptConfig.scale, DEFAULT_SCALE),
      sampler: promptConfig.sampler || DEFAULT_SAMPLER,
      steps: Math.round(numberOrFallback(promptConfig.steps, DEFAULT_STEPS)),
      strength: numberOrFallback(promptConfig.strength, DEFAULT_STRENGTH),
      noise: numberOrFallback(promptConfig.noise, DEFAULT_NOISE),
      sm: false,
      sm_dyn: false,
      seed: Math.floor(Math.random() * 2147483647),
      image: imageBase64,
      mask: maskBase64,
      negative_prompt: buildNegativePrompt(
        promptConfig.negative_prompt,
        promptConfig.uc_preset || DEFAULT_UC_PRESET
      ),
      extra_noise_seed: Math.floor(Math.random() * 2147483647),
      add_original_image: true,
      cfg_rescale: 0,
      use_coords: false,
      inpaintImg2ImgStrength: 1,
      n_samples: 1,
    }
  });

  return new Promise((resolve, reject) => {
    const url = new URL(NOVELAI_API_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Length': Buffer.byteLength(payload),
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);

        if (res.statusCode !== 200) {
          // Try to decode error message
          try {
            let body;
            const encoding = res.headers['content-encoding'];
            if (encoding === 'gzip') {
              body = zlib.gunzipSync(buffer).toString();
            } else if (encoding === 'br') {
              body = zlib.brotliDecompressSync(buffer).toString();
            } else {
              body = buffer.toString();
            }
            reject(new Error(`NovelAI API Error (${res.statusCode}): ${body}`));
          } catch (e) {
            reject(new Error(`NovelAI API Error (${res.statusCode})`));
          }
          return;
        }

        // Response is a zip file containing the generated image
        // Try to decompress based on content-encoding
        try {
          const encoding = res.headers['content-encoding'];
          let data;
          if (encoding === 'gzip') {
            data = zlib.gunzipSync(buffer);
          } else if (encoding === 'br') {
            data = zlib.brotliDecompressSync(buffer);
          } else {
            data = buffer;
          }
          // The response is a zip file, we need to extract the PNG
          resolve(extractImageFromZip(data));
        } catch (e) {
          // Try raw buffer as zip
          try {
            resolve(extractImageFromZip(buffer));
          } catch (e2) {
            reject(new Error('Failed to parse NovelAI response: ' + e2.message));
          }
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

/**
 * Extract PNG image from a simple ZIP file
 * NovelAI returns a ZIP with a single PNG file inside
 */
function extractImageFromZip(zipBuffer) {
  // Find local file header signature (PK\x03\x04)
  const localFileHeaderSig = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
  const idx = zipBuffer.indexOf(localFileHeaderSig);
  if (idx === -1) {
    // Maybe it's already a PNG?
    const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
    if (zipBuffer.indexOf(pngSig) >= 0) {
      const pngStart = zipBuffer.indexOf(pngSig);
      return zipBuffer.slice(pngStart);
    }
    throw new Error('No valid image found in response');
  }

  // Parse local file header
  const compressedSize = zipBuffer.readUInt32LE(idx + 18);
  const uncompressedSize = zipBuffer.readUInt32LE(idx + 22);
  const filenameLen = zipBuffer.readUInt16LE(idx + 26);
  const extraLen = zipBuffer.readUInt16LE(idx + 28);
  const compressionMethod = zipBuffer.readUInt16LE(idx + 8);
  const dataOffset = idx + 30 + filenameLen + extraLen;

  if (compressionMethod === 0) {
    // Stored (no compression)
    return zipBuffer.slice(dataOffset, dataOffset + uncompressedSize);
  } else if (compressionMethod === 8) {
    // Deflate
    const compressedData = zipBuffer.slice(dataOffset, dataOffset + compressedSize);
    return zlib.inflateRawSync(compressedData);
  } else {
    throw new Error(`Unsupported compression method: ${compressionMethod}`);
  }
}

module.exports = { callInpaint };
