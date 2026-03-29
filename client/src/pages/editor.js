import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.min.css';
import { images, prompts } from '../api.js';

const TARGET_WIDTH = 832;
const TARGET_HEIGHT = 1216;

let currentStep = 1;
let cropper = null;
let croppedImageDataUrl = null;
let maskCanvas = null;
let maskCtx = null;
let bgCanvas = null;
let bgCtx = null;
let isDrawing = false;
let brushSize = 30;
let drawMode = 'brush'; // 'brush' or 'eraser'
let selectedPromptId = null;

export function renderEditor(app, user, preSelectedPrompt, onBack) {
  if (preSelectedPrompt) {
    selectedPromptId = preSelectedPrompt.id;
  }
  
  currentStep = 1;
  croppedImageDataUrl = null;
  
  app.innerHTML = `
    <div class="editor">
      <!-- Step Indicators -->
      <div class="editor-steps">
        <div class="step-indicator active" id="step-ind-1">
          <span class="step-number">1</span>
          <span>画像アップロード & トリミング</span>
        </div>
        <div class="step-connector" id="conn-1-2"></div>
        <div class="step-indicator" id="step-ind-2">
          <span class="step-number">2</span>
          <span>マスク塗り</span>
        </div>
        <div class="step-connector" id="conn-2-3"></div>
        <div class="step-indicator" id="step-ind-3">
          <span class="step-number">3</span>
          <span>変換実行</span>
        </div>
      </div>
      
      <!-- Step Content -->
      <div id="step-content"></div>
    </div>
  `;

  renderStep1();
}

function updateStepIndicators() {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step-ind-${i}`);
    if (!el) continue;
    el.classList.remove('active', 'completed');
    if (i < currentStep) el.classList.add('completed');
    if (i === currentStep) el.classList.add('active');
  }
  for (let i = 1; i <= 2; i++) {
    const conn = document.getElementById(`conn-${i}-${i + 1}`);
    if (!conn) continue;
    conn.classList.toggle('completed', i < currentStep);
  }
}

// =========================================
// Step 1: Upload & Crop
// =========================================
function renderStep1() {
  currentStep = 1;
  updateStepIndicators();
  
  const content = document.getElementById('step-content');
  content.innerHTML = `
    <div class="editor-panel">
      <h3 class="editor-title">📸 画像をアップロード & トリミング</h3>
      <p class="editor-subtitle">変換したい画像をアップロードし、${TARGET_WIDTH}×${TARGET_HEIGHT}px のサイズにトリミングしてください。</p>
      
      <div id="upload-area">
        <div class="upload-zone" id="upload-zone">
          <div class="upload-icon">🖼️</div>
          <h3>ここに画像をドロップ</h3>
          <p>または クリックしてファイルを選択</p>
          <p class="mt-1" style="color: var(--accent-secondary)">PNG, JPG, WEBP 対応</p>
        </div>
        <input type="file" id="file-input" accept="image/*" style="display:none" />
      </div>
      
      <div id="crop-area" class="hidden">
        <div class="crop-container" id="crop-container">
          <img id="crop-image" />
        </div>
        <div class="crop-actions">
          <button class="btn btn-secondary" id="crop-reselect">📁 別の画像を選択</button>
          <button class="btn btn-primary" id="crop-confirm">✂️ トリミングして次へ</button>
        </div>
      </div>
    </div>
  `;

  setupUpload();
}

function setupUpload() {
  const zone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');

  zone.addEventListener('click', () => fileInput.click());
  
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });
  
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
  });
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('画像ファイルを選択してください', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('upload-area').classList.add('hidden');
    document.getElementById('crop-area').classList.remove('hidden');
    
    const img = document.getElementById('crop-image');
    img.src = e.target.result;
    
    // Destroy previous cropper
    if (cropper) cropper.destroy();
    
    img.onload = () => {
      cropper = new Cropper(img, {
        aspectRatio: TARGET_WIDTH / TARGET_HEIGHT,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 1,
        responsive: true,
        guides: true,
        center: true,
        highlight: false,
        background: false,
      });
    };

    // Reselect button
    document.getElementById('crop-reselect').addEventListener('click', () => {
      if (cropper) cropper.destroy();
      cropper = null;
      document.getElementById('crop-area').classList.add('hidden');
      document.getElementById('upload-area').classList.remove('hidden');
    });

    // Confirm crop
    document.getElementById('crop-confirm').addEventListener('click', () => {
      if (!cropper) return;
      const canvas = cropper.getCroppedCanvas({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
      croppedImageDataUrl = canvas.toDataURL('image/png');
      cropper.destroy();
      cropper = null;
      renderStep2();
    });
  };
  reader.readAsDataURL(file);
}

// =========================================
// Step 2: Mask Painting
// =========================================
function renderStep2() {
  currentStep = 2;
  updateStepIndicators();
  
  const content = document.getElementById('step-content');
  content.innerHTML = `
    <div class="editor-panel">
      <h3 class="editor-title">🎨 マスクを塗る</h3>
      <p class="editor-subtitle">変換（inpaint）したい部分を白色のブラシで塗ってください。塗った部分がAIによって変換されます。</p>
      
      <div class="mask-editor">
        <div class="canvas-wrapper" id="canvas-wrapper">
          <canvas id="bg-canvas"></canvas>
          <canvas id="mask-canvas" style="position:absolute; top:0; left:0; cursor:crosshair;"></canvas>
        </div>
        
        <div class="mask-tools">
          <div class="tool-group">
            <span class="tool-label">ツール:</span>
            <button class="tool-btn active" id="tool-brush" title="ブラシ">🖌️</button>
            <button class="tool-btn" id="tool-eraser" title="消しゴム">🧹</button>
          </div>

          <div class="tool-group">
            <span class="tool-label">サイズ:</span>
            <input type="range" class="brush-size-slider" id="brush-size" min="5" max="100" value="30" />
            <span class="brush-size-value" id="brush-size-value">30</span>
          </div>

          <div class="tool-group">
            <button class="btn btn-sm btn-secondary" id="mask-clear">全消去</button>
            <button class="btn btn-sm btn-secondary" id="mask-fill">全塗り</button>
          </div>
        </div>
        
        <div class="crop-actions mt-2">
          <button class="btn btn-secondary" id="mask-back">← トリミングに戻る</button>
          <button class="btn btn-primary" id="mask-next">変換実行 →</button>
        </div>
      </div>
    </div>
  `;

  setupMaskCanvas();
}

function setupMaskCanvas() {
  const wrapper = document.getElementById('canvas-wrapper');
  bgCanvas = document.getElementById('bg-canvas');
  maskCanvas = document.getElementById('mask-canvas');
  bgCtx = bgCanvas.getContext('2d');
  maskCtx = maskCanvas.getContext('2d');
  
  const img = new Image();
  img.onload = () => {
    // Set canvas size
    const displayWidth = Math.min(TARGET_WIDTH, wrapper.parentElement.clientWidth - 20);
    const displayHeight = (displayWidth / TARGET_WIDTH) * TARGET_HEIGHT;
    
    bgCanvas.width = TARGET_WIDTH;
    bgCanvas.height = TARGET_HEIGHT;
    bgCanvas.style.width = displayWidth + 'px';
    bgCanvas.style.height = displayHeight + 'px';
    
    maskCanvas.width = TARGET_WIDTH;
    maskCanvas.height = TARGET_HEIGHT;
    maskCanvas.style.width = displayWidth + 'px';
    maskCanvas.style.height = displayHeight + 'px';
    
    wrapper.style.width = displayWidth + 'px';
    wrapper.style.height = displayHeight + 'px';
    
    // Draw background image
    bgCtx.drawImage(img, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    
    // Clear mask (transparent)
    maskCtx.clearRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
  };
  img.src = croppedImageDataUrl;

  // Drawing events
  function getPos(e) {
    const rect = maskCanvas.getBoundingClientRect();
    const scaleX = TARGET_WIDTH / rect.width;
    const scaleY = TARGET_HEIGHT / rect.height;
    
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function draw(pos) {
    maskCtx.beginPath();
    maskCtx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
    
    if (drawMode === 'brush') {
      maskCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      maskCtx.fill();
    } else {
      maskCtx.save();
      maskCtx.globalCompositeOperation = 'destination-out';
      maskCtx.fillStyle = 'rgba(0, 0, 0, 1)';
      maskCtx.fill();
      maskCtx.restore();
    }
  }

  let lastPos = null;
  
  function drawLine(from, to) {
    const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
    const steps = Math.max(1, Math.floor(dist / (brushSize / 4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      draw({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
  }

  maskCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    lastPos = getPos(e);
    draw(lastPos);
  });

  maskCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const pos = getPos(e);
    drawLine(lastPos, pos);
    lastPos = pos;
  });

  maskCanvas.addEventListener('mouseup', () => { isDrawing = false; lastPos = null; });
  maskCanvas.addEventListener('mouseleave', () => { isDrawing = false; lastPos = null; });

  // Touch support
  maskCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isDrawing = true;
    lastPos = getPos(e);
    draw(lastPos);
  }, { passive: false });

  maskCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const pos = getPos(e);
    drawLine(lastPos, pos);
    lastPos = pos;
  }, { passive: false });

  maskCanvas.addEventListener('touchend', () => { isDrawing = false; lastPos = null; });

  // Tools
  document.getElementById('tool-brush').addEventListener('click', () => {
    drawMode = 'brush';
    document.getElementById('tool-brush').classList.add('active');
    document.getElementById('tool-eraser').classList.remove('active');
  });

  document.getElementById('tool-eraser').addEventListener('click', () => {
    drawMode = 'eraser';
    document.getElementById('tool-eraser').classList.add('active');
    document.getElementById('tool-brush').classList.remove('active');
  });

  // Brush size
  const sizeSlider = document.getElementById('brush-size');
  const sizeValue = document.getElementById('brush-size-value');
  sizeSlider.addEventListener('input', (e) => {
    brushSize = parseInt(e.target.value);
    sizeValue.textContent = brushSize;
  });

  // Clear / Fill
  document.getElementById('mask-clear').addEventListener('click', () => {
    maskCtx.clearRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
  });

  document.getElementById('mask-fill').addEventListener('click', () => {
    maskCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    maskCtx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
  });

  // Navigation
  document.getElementById('mask-back').addEventListener('click', () => {
    renderStep1();
  });

  document.getElementById('mask-next').addEventListener('click', () => {
    renderStep3();
  });
}

// =========================================
// Step 3: Execute Inpaint
// =========================================
async function renderStep3() {
  currentStep = 3;
  updateStepIndicators();

  // Generate the proper mask (white on black)
  const finalMaskCanvas = document.createElement('canvas');
  finalMaskCanvas.width = TARGET_WIDTH;
  finalMaskCanvas.height = TARGET_HEIGHT;
  const finalMaskCtx = finalMaskCanvas.getContext('2d');

  // Fill black background
  finalMaskCtx.fillStyle = '#000000';
  finalMaskCtx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

  // Get mask image data and convert to white-on-black
  const maskData = maskCtx.getImageData(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
  const finalData = finalMaskCtx.getImageData(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
  
  for (let i = 0; i < maskData.data.length; i += 4) {
    if (maskData.data[i + 3] > 30) { // If pixel has some alpha (was painted)
      finalData.data[i] = 255;     // R
      finalData.data[i + 1] = 255; // G
      finalData.data[i + 2] = 255; // B
      finalData.data[i + 3] = 255; // A
    }
  }
  finalMaskCtx.putImageData(finalData, 0, 0);

  const content = document.getElementById('step-content');
  
  // If no prompt selected, show prompt selection
  if (!selectedPromptId) {
    content.innerHTML = `
      <div class="editor-panel">
        <h3 class="editor-title">⚡ 変換スタイルを選択</h3>
        <p class="editor-subtitle">使用する変換プロンプトを選んでから実行してください。</p>
        
        <div class="prompt-select-grid" id="prompt-select-grid">
          <div class="loading-screen" style="min-height:150px"><div class="loading-spinner"></div></div>
        </div>
        
        <div class="crop-actions mt-2">
          <button class="btn btn-secondary" id="step3-back">← マスク塗りに戻る</button>
          <button class="btn btn-primary btn-lg" id="execute-btn" disabled>🚀 変換を実行</button>
        </div>
      </div>
    `;

    document.getElementById('step3-back').addEventListener('click', () => renderStep2());

    try {
      const data = await prompts.list();
      const grid = document.getElementById('prompt-select-grid');
      
      if (data.prompts.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-secondary)">プロンプトが設定されていません。</p>';
        return;
      }

      grid.innerHTML = data.prompts.map(p => `
        <div class="card prompt-select-card" data-id="${p.id}">
          <div class="card-title">${escapeHtml(p.name)}</div>
          <div class="card-description">${escapeHtml(p.description || '')}</div>
        </div>
      `).join('');

      grid.querySelectorAll('.prompt-select-card').forEach(card => {
        card.addEventListener('click', () => {
          grid.querySelectorAll('.prompt-select-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedPromptId = parseInt(card.dataset.id);
          document.getElementById('execute-btn').disabled = false;
        });
      });

      document.getElementById('execute-btn').addEventListener('click', () => {
        executeInpaint(finalMaskCanvas);
      });
    } catch (err) {
      document.getElementById('prompt-select-grid').innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.message)}</p>`;
    }
  } else {
    executeInpaint(finalMaskCanvas);
  }
}

async function executeInpaint(finalMaskCanvas) {
  // Show processing overlay
  const overlay = document.createElement('div');
  overlay.className = 'processing-overlay';
  overlay.id = 'processing-overlay';
  overlay.innerHTML = `
    <div class="processing-content">
      <div class="loading-spinner"></div>
      <h3>AIが変換中...</h3>
      <p>NovelAI で画像を生成しています。しばらくお待ちください。</p>
    </div>
  `;
  document.body.appendChild(overlay);

  try {
    // Convert canvas to blob
    const imageBlob = await canvasToBlob(croppedImageDataUrl);
    const maskBlob = await new Promise(resolve => finalMaskCanvas.toBlob(resolve, 'image/png'));
    
    const formData = new FormData();
    formData.append('image', imageBlob, 'image.png');
    formData.append('mask', maskBlob, 'mask.png');
    formData.append('prompt_id', selectedPromptId);

    const result = await images.inpaint(formData);
    
    overlay.remove();
    showResult(result.image);
  } catch (err) {
    overlay.remove();
    showToast(`変換エラー: ${err.message}`, 'error');
    // Go back to step 3 prompt selection
    renderStep3();
  }
}

function showResult(resultDataUrl) {
  const content = document.getElementById('step-content');
  content.innerHTML = `
    <div class="result-section">
      <h3 class="editor-title">🎉 変換完了！</h3>
      <p class="editor-subtitle">左が元の画像、右がAIによる変換結果です。</p>
      
      <div class="result-images">
        <div class="result-image-container">
          <img src="${croppedImageDataUrl}" alt="Original" />
          <div class="result-image-label">元の画像</div>
        </div>
        <div class="result-image-container">
          <img src="${resultDataUrl}" alt="Result" id="result-img" />
          <div class="result-image-label">変換結果</div>
        </div>
      </div>
      
      <div class="crop-actions mt-2">
        <button class="btn btn-secondary" id="result-back">← 新しい画像で変換</button>
        <button class="btn btn-primary" id="result-download">💾 ダウンロード</button>
      </div>
    </div>
  `;

  document.getElementById('result-back').addEventListener('click', () => {
    selectedPromptId = null;
    croppedImageDataUrl = null;
    renderStep1();
  });

  document.getElementById('result-download').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = resultDataUrl;
    a.download = `illustconverter_${Date.now()}.png`;
    a.click();
  });
}

// Helpers
function canvasToBlob(dataUrl) {
  return fetch(dataUrl).then(r => r.blob());
}

function escapeHtml(str) {
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
