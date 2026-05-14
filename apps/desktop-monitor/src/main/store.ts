// ============================================================
// 로컬 영구 저장소 — 설정/통계/인증 토큰
// %APPDATA%/Megaload Monitor/config.json (Win)
// ~/Library/Application Support/Megaload Monitor (Mac)
// ============================================================

import Store from 'electron-store';

interface StoreSchema {
  // 인증
  isLoggedIn?: boolean;
  authToken?: string;
  refreshToken?: string;
  userId?: string;
  userEmail?: string;
  megaloadUserId?: string;

  // 설정
  autoLaunchInitialized?: boolean;
  checkIntervalSec?: number; // 모니터당 체크 간격 (기본 10초)
  maxConcurrent?: number;    // 동시 호출 수 (기본 1)
  pauseUntil?: string;       // 임시 일시정지 만료 시각

  // 통계
  totalChecked?: number;
  totalErrors?: number;
  lastCheckAt?: string;
  lastHeartbeatAt?: string;
}

let _store: Store<StoreSchema> | null = null;

export function getStore(): Store<StoreSchema> {
  if (!_store) {
    _store = new Store<StoreSchema>({
      name: 'config',
      defaults: {
        checkIntervalSec: 10,
        maxConcurrent: 1,
        totalChecked: 0,
        totalErrors: 0,
      },
    });
  }
  return _store;
}
