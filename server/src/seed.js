require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');
const {
  getDefaultPromptSeed,
} = require('./novelai-config');

const email = process.env.ADMIN_EMAIL || 'admin@illustconverter.com';
const password = process.env.ADMIN_PASSWORD || 'admin123456';
const username = 'Admin';

// Check if admin exists
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  // Update to admin if not already
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id);
  console.log(`✅ Admin account already exists: ${email} (updated admin flag)`);
} else {
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (email, password, username, is_admin) VALUES (?, ?, ?, 1)'
  ).run(email, hashedPassword, username);
  console.log(`✅ Admin account created: ${email}`);
}

// Create a sample prompt if none exist
const promptCount = db.prepare('SELECT COUNT(*) as count FROM prompts').get();
if (promptCount.count === 0) {
  const defaultPrompt = getDefaultPromptSeed();
  db.prepare(`
    INSERT INTO prompts (
      name, description, prompt, negative_prompt, strength, noise, sampler, steps, scale, model,
      quality_tags_enabled, uc_preset, character_prompts_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
    defaultPrompt.character_prompts_json
  );
  console.log('✅ Sample prompt created');
}

console.log('✅ Seed completed');
process.exit(0);
