/**
 * 사용자 플랫폼 판별 (브라우저) — 어떤 설치파일을 받아야 하는지, 자동 업데이트가 되는지
 * 안내하는 데 쓴다.
 *
 * ⚠️ 맥의 칩(애플실리콘/인텔)은 **User-Agent 로 알 수 없다** — 애플실리콘 맥도 호환성을 위해
 *    UA 에 "Intel Mac OS X" 를 그대로 보낸다. 실제 칩이 드러나는 곳은 WebGL 렌더러 문자열뿐이다
 *    (애플실리콘: "Apple M1"/"Apple GPU", 인텔맥: "Intel Iris…"/"AMD Radeon Pro…").
 *    브라우저가 렌더러를 가리면 'unknown' → 호출부가 둘 다 보여주고 확인법을 안내한다.
 *
 * ⚠️ 도우미는 **이 브라우저와 같은 PC 에서 도는 로컬 프로그램**이다. 그래서 "이 브라우저가
 *    맥이면 도우미도 맥"으로 봐도 실무상 어긋나지 않는다(다른 PC 의 도우미에 붙은 경우는
 *    connection 배지가 따로 'other-pc' 로 구분한다).
 */

export type UserPlatform = {
  os: 'windows' | 'mac' | 'other';
  macArch: 'arm' | 'intel' | 'unknown';
};

/** WebGL 렌더러 문자열. 브라우저가 가리면 ''(빈 문자열). */
export function readGpuRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')
      || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return '';
    return (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string) || '';
  } catch { return ''; }
}

export function detectUserPlatform(): UserPlatform {
  if (typeof navigator === 'undefined') return { os: 'other', macArch: 'unknown' };
  const ua = navigator.userAgent;
  if (/Windows NT/i.test(ua)) return { os: 'windows', macArch: 'unknown' };
  if (/Mac OS X|Macintosh/i.test(ua)) {
    const r = readGpuRenderer().toUpperCase();
    if (/APPLE/.test(r)) return { os: 'mac', macArch: 'arm' };
    if (/INTEL|AMD|RADEON/.test(r)) return { os: 'mac', macArch: 'intel' };
    return { os: 'mac', macArch: 'unknown' };
  }
  return { os: 'other', macArch: 'unknown' };
}

/**
 * 이 플랫폼에서 도우미가 스스로 업데이트되는가.
 * macOS 는 코드서명이 없어 Squirrel.Mac 이 앱을 교체할 수 없다 → 사용자가 dmg 를 직접 받아야 한다.
 * 이 사실을 UI 가 알아야 "곧 자동으로 올라갑니다" 와 "직접 받으세요" 를 구분해 안내할 수 있다.
 */
export function hasAutoUpdate(p: UserPlatform | null): boolean {
  return p?.os !== 'mac';
}
