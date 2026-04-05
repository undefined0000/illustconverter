const FIXED_NOVELAI_MODEL = 'nai-diffusion-4-5-full-inpainting';
const FIXED_IMAGE_WIDTH = 832;
const FIXED_IMAGE_HEIGHT = 1216;
const DEFAULT_STRENGTH = 0.7;
const DEFAULT_NOISE = 0.0;
const DEFAULT_SAMPLER = 'k_euler_ancestral';
const DEFAULT_STEPS = 23;
const MAX_FREE_STEPS = 28;
const DEFAULT_SCALE = 5.0;
const DEFAULT_UC_PRESET = 'heavy';
const MAX_CHARACTER_PROMPTS = 6;
const QUALITY_TAG_SUFFIX = ', very aesthetic, masterpiece, no text';

const VALID_SAMPLERS = new Set([
  'k_euler',
  'k_euler_ancestral',
  'k_dpmpp_2s_ancestral',
  'k_dpmpp_2m',
  'k_dpmpp_sde',
  'ddim',
]);

const UC_PRESETS = Object.freeze({
  heavy: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
  light: 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page',
  furryFocus: '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic',
  humanFocus: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',
  none: '',
});

function normalizeCharacterPrompts(rawValue) {
  let prompts = [];

  if (Array.isArray(rawValue)) {
    prompts = rawValue;
  } else if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        prompts = Array.isArray(parsed) ? parsed : [trimmed];
      } catch {
        prompts = [trimmed];
      }
    }
  }

  return prompts
    .map((prompt) => (typeof prompt === 'string' ? prompt.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_CHARACTER_PROMPTS);
}

function serializeCharacterPrompts(rawValue) {
  return JSON.stringify(normalizeCharacterPrompts(rawValue));
}

function appendPromptSuffix(basePrompt, suffix) {
  const cleanBase = String(basePrompt || '').trim().replace(/[,\s]+$/, '');
  if (!suffix) {
    return cleanBase;
  }

  if (!cleanBase) {
    return suffix.replace(/^,\s*/, '');
  }

  return `${cleanBase}${suffix}`;
}

function buildPromptInput(basePrompt, characterPrompts, qualityTagsEnabled = true) {
  const promptParts = [];
  const promptText = qualityTagsEnabled
    ? appendPromptSuffix(basePrompt, QUALITY_TAG_SUFFIX)
    : String(basePrompt || '').trim();

  if (promptText) {
    promptParts.push(promptText);
  }

  promptParts.push(...normalizeCharacterPrompts(characterPrompts));
  return promptParts.join(' | ');
}

function buildNegativePrompt(negativePrompt, ucPreset = DEFAULT_UC_PRESET) {
  const presetText = UC_PRESETS[ucPreset] ?? UC_PRESETS[DEFAULT_UC_PRESET];
  const customText = String(negativePrompt || '').trim();
  return [presetText, customText].filter(Boolean).join(', ');
}

function serializePromptRecord(prompt) {
  if (!prompt) {
    return prompt;
  }

  return {
    ...prompt,
    model: FIXED_NOVELAI_MODEL,
    quality_tags_enabled: Number(prompt.quality_tags_enabled ?? 1),
    uc_preset: prompt.uc_preset || DEFAULT_UC_PRESET,
    character_prompts: normalizeCharacterPrompts(prompt.character_prompts_json),
  };
}

function getDefaultPromptSeed() {
  return {
    name: 'スタンダード',
    description: '標準の仕上がり設定',
    prompt: '1girl, solo, anime coloring, clean lineart, refined shading, upper body, looking at viewer',
    negative_prompt: 'text, signature, watermark, duplicate face, extra arms, extra hands',
    strength: DEFAULT_STRENGTH,
    noise: DEFAULT_NOISE,
    sampler: DEFAULT_SAMPLER,
    steps: DEFAULT_STEPS,
    scale: DEFAULT_SCALE,
    model: FIXED_NOVELAI_MODEL,
    quality_tags_enabled: 1,
    uc_preset: DEFAULT_UC_PRESET,
    character_prompts_json: serializeCharacterPrompts([]),
  };
}

module.exports = {
  FIXED_NOVELAI_MODEL,
  FIXED_IMAGE_WIDTH,
  FIXED_IMAGE_HEIGHT,
  DEFAULT_STRENGTH,
  DEFAULT_NOISE,
  DEFAULT_SAMPLER,
  DEFAULT_STEPS,
  MAX_FREE_STEPS,
  DEFAULT_SCALE,
  DEFAULT_UC_PRESET,
  MAX_CHARACTER_PROMPTS,
  QUALITY_TAG_SUFFIX,
  VALID_SAMPLERS,
  UC_PRESETS,
  normalizeCharacterPrompts,
  serializeCharacterPrompts,
  buildPromptInput,
  buildNegativePrompt,
  serializePromptRecord,
  getDefaultPromptSeed,
};
