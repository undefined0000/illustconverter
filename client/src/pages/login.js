import { auth, setToken, setUser } from '../api.js';

export function renderLogin(app, onLoginSuccess) {
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card card">
        <div class="auth-header">
          <h1>IllustConverter</h1>
          <p>AI イラスト変換サービス</p>
        </div>
        
        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login">ログイン</button>
          <button class="auth-tab" id="tab-register">新規登録</button>
        </div>
        
        <div class="auth-error" id="auth-error"></div>
        
        <!-- Login Form -->
        <form id="login-form">
          <div class="form-group">
            <label class="form-label" for="login-email">メールアドレス</label>
            <input class="form-input" type="email" id="login-email" placeholder="your@email.com" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="login-password">パスワード</label>
            <input class="form-input" type="password" id="login-password" placeholder="••••••••" required />
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%" id="login-btn">
            ログイン
          </button>
        </form>
        
        <!-- Register Form -->
        <form id="register-form" class="hidden">
          <div class="form-group">
            <label class="form-label" for="reg-username">ユーザー名</label>
            <input class="form-input" type="text" id="reg-username" placeholder="表示名" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-email">メールアドレス</label>
            <input class="form-input" type="email" id="reg-email" placeholder="your@email.com" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-password">パスワード</label>
            <input class="form-input" type="password" id="reg-password" placeholder="6文字以上" required minlength="6" />
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%" id="register-btn">
            アカウント作成
          </button>
        </form>
      </div>
    </div>
  `;

  // Tab switching
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const errorEl = document.getElementById('auth-error');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 5000);
  }

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'ログイン中...';

    try {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const data = await auth.login(email, password);
      setToken(data.token);
      setUser(data.user);
      onLoginSuccess(data.user);
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'ログイン';
    }
  });

  // Register
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.textContent = '作成中...';

    try {
      const username = document.getElementById('reg-username').value;
      const email = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;
      const data = await auth.register(email, password, username);
      setToken(data.token);
      setUser(data.user);
      onLoginSuccess(data.user);
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'アカウント作成';
    }
  });
}
