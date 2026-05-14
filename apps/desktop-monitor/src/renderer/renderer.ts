// ============================================================
// Renderer — 설정 창 UI 로직
// preload 에서 노출한 window.megaload API 사용
// ============================================================

export {}; // make this a module so global augmentation is allowed

declare global {
  interface Window {
    megaload: {
      getVersion(): Promise<string>;
      getStats(): Promise<{
        totalChecked: number;
        lastCheckAt?: string;
        isLoggedIn: boolean;
        autoLaunch: boolean;
      }>;
      setAutoLaunch(enabled: boolean): Promise<boolean>;
      hideWindow(): Promise<void>;
      login(token: string): Promise<{ success: boolean; error?: string; megaloadUserId?: string }>;
      logout(): Promise<{ success: boolean }>;
    };
  }
}

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function formatRelative(iso?: string): string {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

async function refresh(): Promise<void> {
  try {
    const stats = await window.megaload.getStats();
    const checked = $('stat-checked');
    const last = $('stat-last');
    const dot = $('status-dot');
    const text = $('status-text');
    const toggle = $('toggle-autolaunch');
    const loginCard = $('login-card');
    const statusCard = $('status-card');

    if (checked) checked.textContent = stats.totalChecked.toLocaleString() + '건';
    if (last) last.textContent = formatRelative(stats.lastCheckAt);
    if (toggle) {
      if (stats.autoLaunch) toggle.classList.add('on');
      else toggle.classList.remove('on');
    }

    // 로그인 안 됐으면 login 카드 표시
    if (loginCard) loginCard.style.display = stats.isLoggedIn ? 'none' : 'block';
    if (statusCard) statusCard.style.display = stats.isLoggedIn ? 'block' : 'none';

    // 상태 dot
    if (stats.isLoggedIn) {
      const recentlyChecked = stats.lastCheckAt && (Date.now() - new Date(stats.lastCheckAt).getTime() < 5 * 60_000);
      if (dot) {
        dot.classList.toggle('active', !!recentlyChecked);
        dot.classList.toggle('idle', !recentlyChecked);
      }
      if (text) text.textContent = recentlyChecked ? '백그라운드에서 동작 중' : '대기 중 (다음 체크 예약됨)';
    } else {
      if (dot) {
        dot.classList.remove('active');
        dot.classList.add('idle');
      }
      if (text) text.textContent = '로그인 필요';
    }
  } catch (err) {
    console.error('refresh 실패:', err);
  }
}

async function init(): Promise<void> {
  // 버전
  try {
    const v = await window.megaload.getVersion();
    const el = $('version');
    if (el) el.textContent = `v${v}`;
  } catch { /* skip */ }

  // 자동 실행 토글
  $('toggle-autolaunch')?.addEventListener('click', async () => {
    const current = $('toggle-autolaunch')?.classList.contains('on') ?? false;
    await window.megaload.setAutoLaunch(!current);
    await refresh();
  });

  // 창 숨김
  $('btn-hide')?.addEventListener('click', () => {
    void window.megaload.hideWindow();
  });

  // 로그인 — 토큰 입력 후 검증
  $('btn-login')?.addEventListener('click', async () => {
    const input = $('token-input') as HTMLInputElement | null;
    const errorEl = $('login-error');
    if (!input) return;
    const token = input.value.trim();
    if (errorEl) errorEl.textContent = '';
    if (!token) {
      if (errorEl) errorEl.textContent = '토큰을 입력하세요.';
      return;
    }
    const btn = $('btn-login') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = '검증 중...'; }
    try {
      const res = await window.megaload.login(token);
      if (res.success) {
        input.value = '';
        await refresh();
      } else {
        if (errorEl) errorEl.textContent = res.error || '로그인 실패';
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '로그인'; }
    }
  });

  // 토큰 발급 페이지 — 외부 브라우저로 열기 (Electron shell)
  $('open-token-page')?.addEventListener('click', (e) => {
    e.preventDefault();
    // window.open 으로 외부 브라우저 (renderer 에선 shell 직접 호출 불가)
    window.open('https://coupanglanding.vercel.app/megaload/desktop-app', '_blank');
  });

  await refresh();
  setInterval(refresh, 10_000);
}

document.addEventListener('DOMContentLoaded', () => { void init(); });
