// ============================================================
// OS 시작 시 자동 실행 등록
// ============================================================

import AutoLaunch from 'auto-launch';
import { app } from 'electron';

const launcher = new AutoLaunch({
  name: 'Megaload Monitor',
  path: app.getPath('exe'),
  isHidden: true, // 시작 시 트레이만 (창 X)
});

let cachedEnabled = false;

export async function setupAutoLaunch(enabled: boolean): Promise<void> {
  try {
    const isEnabled = await launcher.isEnabled();
    if (enabled && !isEnabled) await launcher.enable();
    if (!enabled && isEnabled) await launcher.disable();
    cachedEnabled = enabled;
  } catch (err) {
    console.error('[auto-launch] setup 실패:', err);
  }
}

export function getAutoLaunchEnabled(): boolean {
  return cachedEnabled;
}

// 부팅 시 현재 상태 캐시
launcher.isEnabled().then((v) => { cachedEnabled = v; }).catch(() => { /* skip */ });
