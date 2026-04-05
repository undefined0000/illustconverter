import { prompts } from '../api.js';

export function renderDashboard(app, user, onSelectPrompt) {
  app.innerHTML = `
    <div class="dashboard">
      <div class="dashboard-hero">
        <h2>✦ 変換設定を選択</h2>
      </div>
      
      <div class="editor-title">プリセット一覧</div>
      <div class="editor-subtitle">利用する設定を選んで開始してください</div>
      
      <div class="prompt-grid" id="prompt-grid">
        <div class="loading-screen" style="min-height:200px">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>
  `;

  loadPrompts(onSelectPrompt);
}

async function loadPrompts(onSelectPrompt) {
  const grid = document.getElementById('prompt-grid');
  try {
    const data = await prompts.list();
    if (data.prompts.length === 0) {
      grid.innerHTML = `
        <div class="card" style="grid-column: 1/-1; text-align:center; padding: 2rem;">
          <p style="color: var(--text-secondary)">まだ変換スタイルが用意されていません。管理者にプロンプトの設定を依頼してください。</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = data.prompts.map(p => `
      <div class="card prompt-card" data-prompt-id="${p.id}">
        <div class="card-title">${escapeHtml(p.name)}</div>
        ${p.description ? `<div class="card-description">${escapeHtml(p.description)}</div>` : ''}
      </div>
    `).join('');

    grid.querySelectorAll('.prompt-card').forEach(card => {
      card.addEventListener('click', () => {
        const promptId = parseInt(card.dataset.promptId);
        const prompt = data.prompts.find(p => p.id === promptId);
        onSelectPrompt(prompt);
      });
    });
  } catch (err) {
    grid.innerHTML = `
      <div class="card" style="grid-column: 1/-1; text-align:center;">
        <p style="color: var(--danger)">設定の読み込みに失敗しました: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
