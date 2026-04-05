import { credit } from '../api.js';

export function renderCredits(app) {
  // Check for status in URL
  const hash = window.location.hash;
  let statusMessage = '';
  if (hash.includes('status=success')) {
    statusMessage = `<div class="toast toast-success" style="position:static; margin-bottom:1rem; animation:none;">✅ 決済が完了しました！クレジットが付与されました。</div>`;
  } else if (hash.includes('status=cancel')) {
    statusMessage = `<div class="toast toast-error" style="position:static; margin-bottom:1rem; animation:none;">決済がキャンセルされました。</div>`;
  }

  app.innerHTML = `
    <div class="dashboard">
      <div class="dashboard-hero" style="padding-bottom: 1rem;">
        <h2>💎 クレジット</h2>
        <p>1回の変換に1クレジット消費します。</p>
      </div>

      ${statusMessage}

      <div class="credit-balance-card card" id="balance-card" style="text-align:center; padding:2rem; margin-bottom:2rem;">
        <div class="loading-spinner" style="margin:0 auto;"></div>
      </div>
      
      <h3 class="editor-title">🛒 クレジットプラン</h3>
      <p class="editor-subtitle">お好みのプランを選んで購入してください</p>
      
      <div class="prompt-grid" id="plans-grid">
        <div class="loading-screen" style="min-height:200px">
          <div class="loading-spinner"></div>
        </div>
      </div>

      <h3 class="editor-title mt-3">📜 購入履歴</h3>
      <div id="history-section" class="mt-2">
        <div class="loading-screen" style="min-height:100px">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>
  `;

  loadBalance();
  loadPlans();
  loadHistory();
}

async function loadBalance() {
  const card = document.getElementById('balance-card');
  try {
    const data = await credit.getBalance();
    card.innerHTML = `
      <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.5rem;">現在の残高</div>
      <div style="font-size:3rem; font-weight:800; background:var(--accent-gradient); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;">
        ${data.credits}
      </div>
      <div style="font-size:0.9rem; color:var(--text-secondary);">クレジット</div>
    `;
  } catch (err) {
    card.innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

async function loadPlans() {
  const grid = document.getElementById('plans-grid');
  try {
    const data = await credit.getPlans();
    if (data.plans.length === 0) {
      grid.innerHTML = `<div class="card" style="grid-column:1/-1; text-align:center; padding:2rem;">
        <p style="color:var(--text-secondary)">プランが設定されていません</p>
      </div>`;
      return;
    }

    grid.innerHTML = data.plans.map((p, i) => `
      <div class="card plan-card" style="text-align:center; position:relative; overflow:hidden;">
        ${i === 1 ? '<div style="position:absolute; top:12px; right:-30px; background:var(--accent-gradient); color:white; font-size:0.65rem; font-weight:700; padding:2px 36px; transform:rotate(45deg); letter-spacing:0.5px;">人気</div>' : ''}
        <div style="font-size:0.8rem; color:var(--accent-secondary); font-weight:600; margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:1px;">${escapeHtml(p.name)}</div>
        <div style="font-size:2.5rem; font-weight:800; margin-bottom:0.25rem;">${p.credits}</div>
        <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem;">クレジット</div>
        ${p.description ? `<p class="card-description" style="margin-bottom:1rem;">${escapeHtml(p.description)}</p>` : ''}
        <div style="font-size:1.25rem; font-weight:700; margin-bottom:1rem;">¥${p.price_yen.toLocaleString()}</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:1rem;">1クレジットあたり ¥${Math.round(p.price_yen / p.credits).toLocaleString()}</div>
        <button class="btn btn-primary btn-lg buy-btn" data-plan-id="${p.id}" style="width:100%">
          💳 購入する
        </button>
      </div>
    `).join('');

    grid.querySelectorAll('.buy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '処理中...';
        try {
          const data = await credit.checkout(parseInt(btn.dataset.planId));
          if (data.checkout_url) {
            window.location.href = data.checkout_url;
          }
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = '💳 購入する';
        }
      });
    });
  } catch (err) {
    grid.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadHistory() {
  const section = document.getElementById('history-section');
  try {
    const data = await credit.getHistory();
    if (data.transactions.length === 0) {
      section.innerHTML = `<div class="card" style="text-align:center; padding:1.5rem;">
        <p style="color:var(--text-secondary)">まだ購入履歴がありません</p>
      </div>`;
      return;
    }

    section.innerHTML = `
      <div class="card" style="padding:0; overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
          <thead>
            <tr style="border-bottom:1px solid var(--border-color);">
              <th style="padding:0.75rem 1rem; text-align:left; color:var(--text-secondary); font-weight:500;">日時</th>
              <th style="padding:0.75rem 1rem; text-align:left; color:var(--text-secondary); font-weight:500;">種別</th>
              <th style="padding:0.75rem 1rem; text-align:left; color:var(--text-secondary); font-weight:500;">プラン</th>
              <th style="padding:0.75rem 1rem; text-align:right; color:var(--text-secondary); font-weight:500;">クレジット</th>
              <th style="padding:0.75rem 1rem; text-align:right; color:var(--text-secondary); font-weight:500;">ステータス</th>
            </tr>
          </thead>
          <tbody>
            ${data.transactions.map(t => `
              <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:0.625rem 1rem;">${new Date(t.created_at).toLocaleString('ja-JP')}</td>
                <td style="padding:0.625rem 1rem;">${t.type === 'purchase' ? '💳 購入' : t.type === 'admin_grant' ? '🎁 管理者付与' : t.type}</td>
                <td style="padding:0.625rem 1rem;">${escapeHtml(t.plan_name || '-')}</td>
                <td style="padding:0.625rem 1rem; text-align:right; color:var(--success); font-weight:600;">+${t.credits_amount}</td>
                <td style="padding:0.625rem 1rem; text-align:right;">
                  <span class="param-tag" style="background:${t.status === 'completed' ? 'rgba(0,184,148,0.2); color:var(--success)' : 'rgba(253,203,110,0.2); color:var(--warning)'}">
                    ${t.status === 'completed' ? '完了' : t.status === 'pending' ? '処理中' : t.status}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    section.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(err.message)}</p></div>`;
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
  existing.forEach(t => { if (t.style.position !== 'static') t.remove(); });
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
