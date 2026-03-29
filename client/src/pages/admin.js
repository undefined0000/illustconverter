import { admin } from '../api.js';

export function renderAdmin(app) {
  app.innerHTML = `
    <div class="admin">
      <div class="admin-header">
        <h2>⚙️ プロンプト管理</h2>
        <button class="btn btn-primary" id="add-prompt-btn">＋ 新規プロンプト</button>
      </div>
      
      <div class="prompt-list" id="prompt-list">
        <div class="loading-screen" style="min-height:200px">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>
    
    <!-- Modal for Add/Edit -->
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
          
          <div class="form-group">
            <label class="form-label">プロンプト *</label>
            <textarea class="form-textarea" id="pf-prompt" required rows="3" placeholder="masterpiece, best quality, ..."></textarea>
          </div>
          
          <div class="form-group">
            <label class="form-label">ネガティブプロンプト</label>
            <textarea class="form-textarea" id="pf-negative" rows="2" placeholder="lowres, bad anatomy, ..."></textarea>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Strength (変換強度)</label>
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
              <input class="form-input" type="number" id="pf-steps" value="28" min="1" max="50" />
            </div>
            <div class="form-group">
              <label class="form-label">Scale (Guidance)</label>
              <input class="form-input" type="number" id="pf-scale" value="5.0" min="0" max="20" step="0.5" />
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">サンプラー</label>
              <select class="form-select" id="pf-sampler">
                <option value="k_euler">k_euler</option>
                <option value="k_euler_ancestral">k_euler_ancestral</option>
                <option value="k_dpmpp_2s_ancestral">k_dpmpp_2s_ancestral</option>
                <option value="k_dpmpp_2m">k_dpmpp_2m</option>
                <option value="k_dpmpp_sde">k_dpmpp_sde</option>
                <option value="ddim">ddim</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">モデル</label>
              <select class="form-select" id="pf-model">
                <option value="nai-diffusion-3">NAI Diffusion 3 (Anime V3)</option>
                <option value="nai-diffusion-4-curated-preview">NAI Diffusion 4 Curated</option>
                <option value="nai-diffusion-4-full">NAI Diffusion 4 Full</option>
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
  `;

  let editingId = null;
  loadPromptList();

  document.getElementById('add-prompt-btn').addEventListener('click', () => openModal());
  document.getElementById('modal-close').addEventListener('click', () => closeModal());
  document.getElementById('modal-cancel').addEventListener('click', () => closeModal());
  document.getElementById('prompt-modal').addEventListener('click', (e) => {
    if (e.target.id === 'prompt-modal') closeModal();
  });

  document.getElementById('prompt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('pf-name').value,
      description: document.getElementById('pf-description').value,
      prompt: document.getElementById('pf-prompt').value,
      negative_prompt: document.getElementById('pf-negative').value,
      strength: parseFloat(document.getElementById('pf-strength').value),
      noise: parseFloat(document.getElementById('pf-noise').value),
      steps: parseInt(document.getElementById('pf-steps').value),
      scale: parseFloat(document.getElementById('pf-scale').value),
      sampler: document.getElementById('pf-sampler').value,
      model: document.getElementById('pf-model').value,
    };

    const btn = document.getElementById('modal-submit');
    btn.disabled = true;
    btn.textContent = '保存中...';

    try {
      if (editingId) {
        await admin.updatePrompt(editingId, data);
        showToast('プロンプトを更新しました');
      } else {
        await admin.createPrompt(data);
        showToast('プロンプトを作成しました');
      }
      closeModal();
      loadPromptList();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存';
    }
  });

  function openModal(prompt = null) {
    editingId = prompt ? prompt.id : null;
    document.getElementById('modal-title').textContent = prompt ? 'プロンプト編集' : '新規プロンプト';
    
    document.getElementById('pf-name').value = prompt?.name || '';
    document.getElementById('pf-description').value = prompt?.description || '';
    document.getElementById('pf-prompt').value = prompt?.prompt || '';
    document.getElementById('pf-negative').value = prompt?.negative_prompt || '';
    document.getElementById('pf-strength').value = prompt?.strength ?? 0.7;
    document.getElementById('pf-noise').value = prompt?.noise ?? 0;
    document.getElementById('pf-steps').value = prompt?.steps ?? 28;
    document.getElementById('pf-scale').value = prompt?.scale ?? 5.0;
    document.getElementById('pf-sampler').value = prompt?.sampler || 'k_euler';
    document.getElementById('pf-model').value = prompt?.model || 'nai-diffusion-3';
    
    document.getElementById('prompt-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('prompt-modal').classList.add('hidden');
    editingId = null;
  }

  async function loadPromptList() {
    const list = document.getElementById('prompt-list');
    try {
      const data = await admin.getPrompts();
      
      if (data.prompts.length === 0) {
        list.innerHTML = `
          <div class="card text-center" style="padding: 3rem">
            <p style="color: var(--text-secondary); font-size: 1.1rem">まだプロンプトがありません</p>
            <p class="mt-1" style="color: var(--text-muted)">「新規プロンプト」ボタンから作成してください</p>
          </div>
        `;
        return;
      }

      list.innerHTML = data.prompts.map(p => `
        <div class="card prompt-item">
          <div class="prompt-item-info">
            <h3>${escapeHtml(p.name)} ${p.is_active ? '' : '<span style="color:var(--warning)">(無効)</span>'}</h3>
            <div class="prompt-text">${escapeHtml(p.prompt)}</div>
            <div class="prompt-params">
              <span class="param-tag">Model: ${escapeHtml(p.model)}</span>
              <span class="param-tag">Strength: ${p.strength}</span>
              <span class="param-tag">Steps: ${p.steps}</span>
              <span class="param-tag">Scale: ${p.scale}</span>
              <span class="param-tag">Sampler: ${escapeHtml(p.sampler)}</span>
            </div>
          </div>
          <div class="prompt-item-actions">
            <button class="btn btn-sm btn-secondary edit-btn" data-id="${p.id}">✏️ 編集</button>
            <button class="btn btn-sm btn-danger delete-btn" data-id="${p.id}">🗑️ 削除</button>
          </div>
        </div>
      `).join('');

      // Edit buttons
      list.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.dataset.id);
          const prompt = data.prompts.find(p => p.id === id);
          openModal(prompt);
        });
      });

      // Delete buttons
      list.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('このプロンプトを削除しますか？')) return;
          try {
            await admin.deletePrompt(parseInt(btn.dataset.id));
            showToast('プロンプトを削除しました');
            loadPromptList();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      list.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(err.message)}</p></div>`;
    }
  }
}

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
