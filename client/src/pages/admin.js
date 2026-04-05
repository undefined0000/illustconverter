import { admin } from '../api.js';

let currentTab = 'prompts';
const FIXED_MODEL_LABEL = 'NovelAI Diffusion V4.5 Full Inpainting';
const FIXED_SIZE_LABEL = '832 x 1216 (縦長固定 / Opus無料範囲)';
const MAX_CHARACTER_PROMPTS = 6;
const DEFAULT_PROMPT_VALUES = {
  strength: 0.7,
  noise: 0,
  steps: 23,
  scale: 5.0,
  sampler: 'k_euler_ancestral',
  quality_tags_enabled: true,
  uc_preset: 'heavy',
};

function renderCharacterPromptFields() {
  const rows = [];
  for (let index = 0; index < MAX_CHARACTER_PROMPTS; index += 2) {
    rows.push(`
      <div class="form-row">
        ${renderCharacterPromptField(index)}
        ${renderCharacterPromptField(index + 1)}
      </div>
    `);
  }
  return rows.join('');
}

function renderCharacterPromptField(index) {
  const number = index + 1;
  const placeholder = number === 1
    ? 'girl, silver hair, blue eyes, soft smile, looking at viewer'
    : '未使用なら空欄のまま';

  return `
    <div class="form-group">
      <label class="form-label">Character Prompt ${number}</label>
      <textarea class="form-textarea" id="pf-character-${index}" rows="2" placeholder="${placeholder}"></textarea>
    </div>
  `;
}

function getCharacterPromptsFromForm() {
  return Array.from({ length: MAX_CHARACTER_PROMPTS }, (_, index) =>
    document.getElementById(`pf-character-${index}`).value.trim()
  ).filter(Boolean);
}

function setCharacterPromptsInForm(prompts = []) {
  const normalized = Array.isArray(prompts) ? prompts : [];
  for (let index = 0; index < MAX_CHARACTER_PROMPTS; index += 1) {
    document.getElementById(`pf-character-${index}`).value = normalized[index] || '';
  }
}

function getCharacterPromptCount(prompt) {
  return Array.isArray(prompt?.character_prompts) ? prompt.character_prompts.filter(Boolean).length : 0;
}

export function renderAdmin(app) {
  const characterPromptFields = renderCharacterPromptFields();
  app.innerHTML = `
    <div class="admin">
      <div class="admin-header">
        <h2>⚙️ 管理パネル</h2>
      </div>

      <div class="auth-tabs" style="margin-bottom:1.5rem; max-width:500px;">
        <button class="auth-tab active" id="tab-prompts">プロンプト</button>
        <button class="auth-tab" id="tab-plans">クレジットプラン</button>
        <button class="auth-tab" id="tab-users">ユーザー</button>
      </div>

      <div id="admin-content"></div>
    </div>
    
    <!-- Prompt Modal -->
    <div class="modal-backdrop hidden" id="prompt-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 id="modal-title">新規プロンプト</h3>
          <button class="modal-close" id="modal-close">×</button>
        </div>
        <form id="prompt-form">
          <div class="form-group">
            <label class="form-label">プロンプト名 *</label>
            <input class="form-input" id="pf-name" required placeholder="例: キャラクター変換" />
          </div>
          <div class="form-group">
            <label class="form-label">説明</label>
            <input class="form-input" id="pf-description" placeholder="ユーザーに表示する説明文" />
          </div>
          <div class="card" style="padding:1rem; margin-bottom:1rem; border-style:dashed;">
            <p style="font-size:.85rem; color:var(--text-secondary); margin-bottom:.5rem;">
              モデルは ${FIXED_MODEL_LABEL} 固定です。サイズは ${FIXED_SIZE_LABEL} 固定で、マスク塗りとトリミングはユーザー側のエディタで行います。
            </p>
            <p style="font-size:.85rem; color:var(--text-secondary);">
              V4.5 は英語タグか短い英語文が前提です。人数タグや scene/style は Base Prompt に入れ、複数人物は Character Prompt に分けてください。
            </p>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">モデル</label>
              <input class="form-input" value="${FIXED_MODEL_LABEL}" readonly />
            </div>
            <div class="form-group">
              <label class="form-label">サイズ</label>
              <input class="form-input" value="${FIXED_SIZE_LABEL}" readonly />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Base Prompt *</label>
            <textarea class="form-textarea" id="pf-prompt" required rows="4" placeholder="1girl, solo, indoors, anime coloring, clean lineart, soft rim light"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Undesired Content</label>
            <textarea class="form-textarea" id="pf-negative" rows="3" placeholder="text, signature, watermark, duplicate face"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Quality Tags</label>
              <label style="display:flex; align-items:center; gap:.6rem; min-height:46px; padding:.75rem 1rem; background:var(--bg-glass); border:1px solid var(--border-color); border-radius:var(--radius-sm); color:var(--text-primary);">
                <input type="checkbox" id="pf-quality-tags" checked />
                full 推奨 quality tags を自動付与
              </label>
            </div>
            <div class="form-group">
              <label class="form-label">UC Preset</label>
              <select class="form-select" id="pf-uc-preset">
                <option value="heavy">heavy</option>
                <option value="light">light</option>
                <option value="furryFocus">furryFocus</option>
                <option value="humanFocus">humanFocus</option>
                <option value="none">none</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Character Prompts</label>
            <p style="font-size:.8rem; color:var(--text-secondary); margin-bottom:.75rem;">
              必要な時だけ 1〜6 個まで入力できます。送信時は <code>Base Prompt | Character 1 | Character 2 ...</code> の形に自動変換されます。
            </p>
          </div>
          ${characterPromptFields}
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Strength</label>
              <input class="form-input" type="number" id="pf-strength" value="0.7" min="0" max="1" step="0.05" />
            </div>
            <div class="form-group">
              <label class="form-label">Noise</label>
              <input class="form-input" type="number" id="pf-noise" value="0" min="0" max="1" step="0.05" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Steps</label>
              <input class="form-input" type="number" id="pf-steps" value="23" min="1" max="28" />
            </div>
            <div class="form-group">
              <label class="form-label">Scale</label>
              <input class="form-input" type="number" id="pf-scale" value="5.0" min="0" max="20" step="0.5" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">サンプラー</label>
              <select class="form-select" id="pf-sampler">
                <option value="k_euler_ancestral">k_euler_ancestral</option>
                <option value="k_euler">k_euler</option>
                <option value="k_dpmpp_2s_ancestral">k_dpmpp_2s_ancestral</option>
                <option value="k_dpmpp_2m">k_dpmpp_2m</option>
                <option value="k_dpmpp_sde">k_dpmpp_sde</option>
                <option value="ddim">ddim</option>
              </select>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">キャンセル</button>
            <button type="submit" class="btn btn-primary" id="modal-submit">保存</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Plan Modal -->
    <div class="modal-backdrop hidden" id="plan-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 id="plan-modal-title">新規プラン</h3>
          <button class="modal-close" id="plan-modal-close">×</button>
        </div>
        <form id="plan-form">
          <div class="form-group">
            <label class="form-label">プラン名 *</label>
            <input class="form-input" id="plf-name" required placeholder="例: スタンダードパック" />
          </div>
          <div class="form-group">
            <label class="form-label">説明</label>
            <input class="form-input" id="plf-description" placeholder="ユーザーに表示する説明" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">クレジット数 *</label>
              <input class="form-input" type="number" id="plf-credits" required min="1" placeholder="20" />
            </div>
            <div class="form-group">
              <label class="form-label">価格 (円) *</label>
              <input class="form-input" type="number" id="plf-price" required min="1" placeholder="1500" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">表示順</label>
            <input class="form-input" type="number" id="plf-sort" value="0" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="plan-modal-cancel">キャンセル</button>
            <button type="submit" class="btn btn-primary" id="plan-modal-submit">保存</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Grant Modal -->
    <div class="modal-backdrop hidden" id="grant-modal">
      <div class="modal" style="max-width:400px;">
        <div class="modal-header">
          <h3>クレジット付与</h3>
          <button class="modal-close" id="grant-modal-close">×</button>
        </div>
        <p style="margin-bottom:1rem; color:var(--text-secondary);" id="grant-target-info"></p>
        <form id="grant-form">
          <div class="form-group">
            <label class="form-label">付与クレジット数</label>
            <input class="form-input" type="number" id="grant-credits" required min="1" value="10" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="grant-modal-cancel">キャンセル</button>
            <button type="submit" class="btn btn-primary">付与</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Tab switching
  const tabs = { prompts: document.getElementById('tab-prompts'), plans: document.getElementById('tab-plans'), users: document.getElementById('tab-users') };
  Object.entries(tabs).forEach(([key, el]) => {
    el.addEventListener('click', () => {
      Object.values(tabs).forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      currentTab = key;
      renderTabContent();
    });
  });

  setupPromptModal();
  setupPlanModal();
  setupGrantModal();
  renderTabContent();
}

function renderTabContent() {
  const content = document.getElementById('admin-content');
  switch (currentTab) {
    case 'prompts': loadPrompts(content); break;
    case 'plans': loadPlans(content); break;
    case 'users': loadUsers(content); break;
  }
}

// ================================
// PROMPTS TAB
// ================================
let editingPromptId = null;

async function loadPrompts(container) {
  container.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:1rem;">
      <button class="btn btn-primary" id="add-prompt-btn">＋ 新規プロンプト</button>
    </div>
    <div class="prompt-list" id="prompt-list">
      <div class="loading-screen" style="min-height:200px"><div class="loading-spinner"></div></div>
    </div>
  `;
  document.getElementById('add-prompt-btn').addEventListener('click', () => openPromptModal());

  const list = document.getElementById('prompt-list');
  try {
    const data = await admin.getPrompts();
    if (data.prompts.length === 0) {
      list.innerHTML = `<div class="card text-center" style="padding:3rem"><p style="color:var(--text-secondary)">まだプロンプトがありません</p></div>`;
      return;
    }
    list.innerHTML = data.prompts.map(p => `
      <div class="card prompt-item">
        <div class="prompt-item-info">
          <h3>${escapeHtml(p.name)} ${p.is_active ? '' : '<span style="color:var(--warning)">(無効)</span>'}</h3>
          <div class="prompt-text">${escapeHtml(p.prompt)}</div>
          <div class="prompt-params">
            <span class="param-tag">Model: V4.5 Full Inpaint</span>
            <span class="param-tag">UC: ${escapeHtml(p.uc_preset || 'heavy')}</span>
            <span class="param-tag">Chars: ${getCharacterPromptCount(p)}</span>
            <span class="param-tag">Quality: ${(p.quality_tags_enabled ?? 1) ? 'auto' : 'off'}</span>
            <span class="param-tag">Str: ${p.strength}</span>
            <span class="param-tag">Steps: ${p.steps}</span>
            <span class="param-tag">Scale: ${p.scale}</span>
          </div>
        </div>
        <div class="prompt-item-actions">
          <button class="btn btn-sm btn-secondary edit-prompt-btn" data-id="${p.id}">✏️</button>
          <button class="btn btn-sm btn-danger delete-prompt-btn" data-id="${p.id}">🗑️</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.edit-prompt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = data.prompts.find(p => p.id === parseInt(btn.dataset.id));
        openPromptModal(prompt);
      });
    });
    list.querySelectorAll('.delete-prompt-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('削除しますか？')) return;
        try { await admin.deletePrompt(parseInt(btn.dataset.id)); showToast('削除しました'); renderTabContent(); } catch (e) { showToast(e.message, 'error'); }
      });
    });
  } catch (err) {
    list.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(err.message)}</p></div>`;
  }
}

function setupPromptModal() {
  document.getElementById('modal-close').addEventListener('click', () => closePromptModal());
  document.getElementById('modal-cancel').addEventListener('click', () => closePromptModal());
  document.getElementById('prompt-modal').addEventListener('click', e => { if (e.target.id === 'prompt-modal') closePromptModal(); });
  document.getElementById('prompt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('pf-name').value.trim(),
      description: document.getElementById('pf-description').value.trim(),
      prompt: document.getElementById('pf-prompt').value.trim(),
      negative_prompt: document.getElementById('pf-negative').value.trim(),
      quality_tags_enabled: document.getElementById('pf-quality-tags').checked,
      uc_preset: document.getElementById('pf-uc-preset').value,
      character_prompts: getCharacterPromptsFromForm(),
      strength: parseFloat(document.getElementById('pf-strength').value),
      noise: parseFloat(document.getElementById('pf-noise').value),
      steps: parseInt(document.getElementById('pf-steps').value),
      scale: parseFloat(document.getElementById('pf-scale').value),
      sampler: document.getElementById('pf-sampler').value,
    };
    const btn = document.getElementById('modal-submit');
    btn.disabled = true;
    try {
      if (editingPromptId) { await admin.updatePrompt(editingPromptId, data); showToast('更新しました'); }
      else { await admin.createPrompt(data); showToast('作成しました'); }
      closePromptModal(); renderTabContent();
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });
}

function openPromptModal(prompt = null) {
  editingPromptId = prompt ? prompt.id : null;
  document.getElementById('modal-title').textContent = prompt ? 'プロンプト編集' : '新規プロンプト';
  document.getElementById('pf-name').value = prompt?.name || '';
  document.getElementById('pf-description').value = prompt?.description || '';
  document.getElementById('pf-prompt').value = prompt?.prompt || '';
  document.getElementById('pf-negative').value = prompt?.negative_prompt || '';
  document.getElementById('pf-quality-tags').checked = Boolean(prompt?.quality_tags_enabled ?? DEFAULT_PROMPT_VALUES.quality_tags_enabled);
  document.getElementById('pf-uc-preset').value = prompt?.uc_preset || DEFAULT_PROMPT_VALUES.uc_preset;
  document.getElementById('pf-strength').value = prompt?.strength ?? DEFAULT_PROMPT_VALUES.strength;
  document.getElementById('pf-noise').value = prompt?.noise ?? DEFAULT_PROMPT_VALUES.noise;
  document.getElementById('pf-steps').value = prompt?.steps ?? DEFAULT_PROMPT_VALUES.steps;
  document.getElementById('pf-scale').value = prompt?.scale ?? DEFAULT_PROMPT_VALUES.scale;
  document.getElementById('pf-sampler').value = prompt?.sampler || DEFAULT_PROMPT_VALUES.sampler;
  setCharacterPromptsInForm(prompt?.character_prompts || []);
  document.getElementById('prompt-modal').classList.remove('hidden');
}

function closePromptModal() { document.getElementById('prompt-modal').classList.add('hidden'); editingPromptId = null; }

// ================================
// PLANS TAB
// ================================
let editingPlanId = null;

async function loadPlans(container) {
  container.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:1rem;">
      <button class="btn btn-primary" id="add-plan-btn">＋ 新規プラン</button>
    </div>
    <div class="prompt-list" id="plan-list">
      <div class="loading-screen" style="min-height:200px"><div class="loading-spinner"></div></div>
    </div>
  `;
  document.getElementById('add-plan-btn').addEventListener('click', () => openPlanModal());

  const list = document.getElementById('plan-list');
  try {
    const data = await admin.getPlans();
    if (data.plans.length === 0) {
      list.innerHTML = `<div class="card text-center" style="padding:3rem"><p style="color:var(--text-secondary)">まだプランがありません</p></div>`;
      return;
    }
    list.innerHTML = data.plans.map(p => `
      <div class="card prompt-item">
        <div class="prompt-item-info">
          <h3>${escapeHtml(p.name)} ${p.is_active ? '' : '<span style="color:var(--warning)">(無効)</span>'}</h3>
          <div class="prompt-params">
            <span class="param-tag">💎 ${p.credits} クレジット</span>
            <span class="param-tag">💴 ¥${p.price_yen.toLocaleString()}</span>
            <span class="param-tag">単価 ¥${Math.round(p.price_yen / p.credits)}/cr</span>
            <span class="param-tag">順序: ${p.sort_order}</span>
          </div>
        </div>
        <div class="prompt-item-actions">
          <button class="btn btn-sm btn-secondary edit-plan-btn" data-id="${p.id}">✏️</button>
          <button class="btn btn-sm btn-danger delete-plan-btn" data-id="${p.id}">🗑️</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.edit-plan-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const plan = data.plans.find(p => p.id === parseInt(btn.dataset.id));
        openPlanModal(plan);
      });
    });
    list.querySelectorAll('.delete-plan-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('削除しますか？')) return;
        try { await admin.deletePlan(parseInt(btn.dataset.id)); showToast('削除しました'); renderTabContent(); } catch (e) { showToast(e.message, 'error'); }
      });
    });
  } catch (err) {
    list.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(err.message)}</p></div>`;
  }
}

function setupPlanModal() {
  document.getElementById('plan-modal-close').addEventListener('click', () => closePlanModal());
  document.getElementById('plan-modal-cancel').addEventListener('click', () => closePlanModal());
  document.getElementById('plan-modal').addEventListener('click', e => { if (e.target.id === 'plan-modal') closePlanModal(); });
  document.getElementById('plan-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('plf-name').value,
      description: document.getElementById('plf-description').value,
      credits: parseInt(document.getElementById('plf-credits').value),
      price_yen: parseInt(document.getElementById('plf-price').value),
      sort_order: parseInt(document.getElementById('plf-sort').value) || 0,
    };
    const btn = document.getElementById('plan-modal-submit');
    btn.disabled = true;
    try {
      if (editingPlanId) { await admin.updatePlan(editingPlanId, data); showToast('更新しました'); }
      else { await admin.createPlan(data); showToast('作成しました'); }
      closePlanModal(); renderTabContent();
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });
}

function openPlanModal(plan = null) {
  editingPlanId = plan ? plan.id : null;
  document.getElementById('plan-modal-title').textContent = plan ? 'プラン編集' : '新規プラン';
  document.getElementById('plf-name').value = plan?.name || '';
  document.getElementById('plf-description').value = plan?.description || '';
  document.getElementById('plf-credits').value = plan?.credits || '';
  document.getElementById('plf-price').value = plan?.price_yen || '';
  document.getElementById('plf-sort').value = plan?.sort_order ?? 0;
  document.getElementById('plan-modal').classList.remove('hidden');
}

function closePlanModal() { document.getElementById('plan-modal').classList.add('hidden'); editingPlanId = null; }

// ================================
// USERS TAB
// ================================
let grantTargetId = null;

async function loadUsers(container) {
  container.innerHTML = `
    <div class="prompt-list" id="user-list">
      <div class="loading-screen" style="min-height:200px"><div class="loading-spinner"></div></div>
    </div>
  `;
  const list = document.getElementById('user-list');
  try {
    const data = await admin.getUsers();
    list.innerHTML = data.users.map(u => `
      <div class="card prompt-item">
        <div class="prompt-item-info">
          <h3>${escapeHtml(u.username)} ${u.is_admin ? '<span class="badge-admin">ADMIN</span>' : ''}</h3>
          <div class="prompt-params">
            <span class="param-tag">📧 ${escapeHtml(u.email)}</span>
            <span class="param-tag">💎 ${u.credits} クレジット</span>
            <span class="param-tag">📅 ${new Date(u.created_at).toLocaleDateString('ja-JP')}</span>
          </div>
        </div>
        <div class="prompt-item-actions">
          <button class="btn btn-sm btn-primary grant-btn" data-id="${u.id}" data-name="${escapeHtml(u.username)}">💎 付与</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.grant-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grantTargetId = parseInt(btn.dataset.id);
        document.getElementById('grant-target-info').textContent = `${btn.dataset.name} にクレジットを付与します`;
        document.getElementById('grant-modal').classList.remove('hidden');
      });
    });
  } catch (err) {
    list.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(err.message)}</p></div>`;
  }
}

function setupGrantModal() {
  document.getElementById('grant-modal-close').addEventListener('click', () => document.getElementById('grant-modal').classList.add('hidden'));
  document.getElementById('grant-modal-cancel').addEventListener('click', () => document.getElementById('grant-modal').classList.add('hidden'));
  document.getElementById('grant-modal').addEventListener('click', e => { if (e.target.id === 'grant-modal') e.target.classList.add('hidden'); });
  document.getElementById('grant-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const credits = parseInt(document.getElementById('grant-credits').value);
    try {
      await admin.grantCredits(grantTargetId, credits);
      showToast(`${credits} クレジットを付与しました`);
      document.getElementById('grant-modal').classList.add('hidden');
      renderTabContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ================================
// Helpers
// ================================
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = 'success') {
  const existing = document.querySelectorAll('.toast');
  existing.forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
