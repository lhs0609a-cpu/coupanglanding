import { createBrowserClient } from '@supabase/ssr';

// 브라우저 탭당 단일 인스턴스로 고정한다.
//  createClient() 가 호출부(236+ 파일)마다 새 GoTrueClient 를 만들면, 각 인스턴스가
//  autoRefreshToken 타이머를 따로 돌려 /auth/v1/token(refresh) 요청이 폭주한다.
//  token 엔드포인트는 grant_type=password(로그인)와 공유라, 갱신 폭주가 IP 한도를
//  소진하면 로그인까지 429 로 막힌다("Multiple GoTrueClient instances" 문제).
//  싱글톤으로 refresh 타이머를 하나로 모아 자가유발 429 를 차단한다.
let _browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  if (_browserClient) return _browserClient;
  _browserClient = createBrowserClient(url, key);
  return _browserClient;
}
