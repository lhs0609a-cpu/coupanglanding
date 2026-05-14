// ============================================================
// Renderer — 설정 창 UI 로직
// preload 에서 노출한 window.megaload API 사용
// ============================================================

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

  // 로그인 (Phase 2에서 구현)
  $('btn-login')?.addEventListener('click', () => {
    alert('Phase 2에서 구현 예정 — 메가로드 OAuth 로그인 연동');
  });

  await refresh();
  setInterval(refresh, 10_000);
}

document.addEventListener('DOMContentLoaded', () => { void init(); });
