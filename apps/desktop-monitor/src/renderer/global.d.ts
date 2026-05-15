// Renderer 전역 타입 — preload 가 노출한 window.megaload API
// .d.ts 로 분리한 이유: renderer.ts에 export 가 있으면 TS가 CommonJS 모듈로 컴파일 →
// 브라우저는 exports/require 미지원 → "exports is not defined" 런타임 에러.
// 이 파일은 emit 안 되며 타입만 제공.

interface MegaloadAPI {
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
}

interface Window {
  megaload: MegaloadAPI;
}
