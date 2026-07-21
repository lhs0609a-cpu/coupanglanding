/**
 * 의존성 0 Supabase REST 헬퍼 (Node 18+ fetch).
 *
 * 워커는 service_role 키를 절대 갖지 않는다. 사용자 이메일/비번으로 로그인해
 * 받은 "사용자 JWT(anon role → authenticated)"로만 호출하고, RLS가 본인 잡으로
 * 스코프를 강제한다. anon 키는 공개키라 배포해도 안전하다.
 */

import { readFile, writeFile } from 'node:fs/promises';

function authHeaders(anonKey, accessToken) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken ?? anonKey}`,
  };
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const msg = (json && (json.error_description || json.error || json.message || json.msg)) || text || res.status;
    throw new Error(`${res.status} ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return json;
}

/** 이메일/비번 로그인 → { access_token, refresh_token, expires_at(ms) } */
export async function login(supabaseUrl, anonKey, email, password) {
  const data = await postJson(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    { apikey: anonKey },
    { email, password },
  );
  return normalizeSession(data);
}

export async function refresh(supabaseUrl, anonKey, refreshToken) {
  const data = await postJson(
    `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
    { apikey: anonKey },
    { refresh_token: refreshToken },
  );
  return normalizeSession(data);
}

/**
 * refresh 실패가 "영구(재페어링 필요)"인지 "일시(재시도하면 됨)"인지 구분한다.
 *   - 영구: refresh_token 이 폐기/무효 (400 invalid_grant / refresh_token_not_found).
 *           이건 재시도해도 소용없고 새 로그인(페어링)만이 답.
 *   - 일시: 네트워크 미준비(ENOTFOUND/ECONNREFUSED/timeout)·5xx·429 등.
 *           부팅 직후 흔하며, 잠시 뒤 재시도하면 그대로 복구된다.
 * 판단 불가하면 "일시"로 본다 — 멀쩡한 세션을 성급히 버려 재페어링을 강요하지 않기 위함.
 */
export function isPermanentAuthError(err) {
  const m = String(err?.message || err || '');
  return /invalid_grant|refresh_token_not_found|invalid refresh token|already used|400\b/i.test(m);
}

function normalizeSession(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

/** 세션을 보관하고 만료 1분 전 자동 refresh. .session.json 에 영속화. */
export class Session {
  constructor(supabaseUrl, anonKey, filePath) {
    this.supabaseUrl = supabaseUrl.replace(/\/$/, '');
    this.anonKey = anonKey;
    this.filePath = filePath;
    this.s = null;
    this._refreshing = null; // 진행 중 refresh 프로미스 (single-flight)
  }
  async loadOrLogin(email, password) {
    if (this.filePath) {
      try {
        const saved = JSON.parse(await readFile(this.filePath, 'utf8'));
        if (saved.refresh_token) {
          try { this.s = await refresh(this.supabaseUrl, this.anonKey, saved.refresh_token); await this._persist(); return; }
          catch { /* refresh 실패 → 재로그인 */ }
        }
      } catch { /* 파일 없음 */ }
    }
    if (!email || !password) throw new Error('저장된 세션이 없고 email/password도 없습니다. config에 입력하세요.');
    this.s = await login(this.supabaseUrl, this.anonKey, email, password);
    await this._persist();
  }
  /** 웹 페어링으로 받은 세션을 직접 주입 (로그인 호출 없이) */
  async seed({ access_token, refresh_token, expires_at }) {
    if (!access_token || !refresh_token) throw new Error('access_token/refresh_token 필수');
    this.s = {
      access_token,
      refresh_token,
      expires_at: typeof expires_at === 'number' ? expires_at : Date.now() + 3600 * 1000,
    };
    await this._persist();
  }
  /**
   * 저장된 세션만 복구 시도 (로그인 안 함).
   *   반환:  true  = 복구 성공 (this.s 채워짐)
   *          false = 복구할 세션 자체가 없음/영구폐기 → 재페어링 필요 (재시도 무의미)
   *   throw       = 일시 오류(네트워크 미준비 등) → 상위에서 백오프 재시도해야 함
   *
   * ★ 부팅 자가치유 핵심:
   *   ① 저장된 access_token 이 아직 유효하면 refresh 를 아예 하지 않는다.
   *      부팅마다 refresh 를 돌리면 1회용(rotating) refresh_token 이 매번 회전하고,
   *      부팅 직후 네트워크 미준비/응답유실로 그 refresh 가 실패하면 저장 토큰이 죽어
   *      "재부팅하면 매번 미연결"이 된다. 유효할 땐 굽지 않는 게 근본 예방.
   *   ② 만료됐을 때만 refresh 하되, 일시 오류는 throw 로 올려 재시도로 자가치유한다.
   */
  async tryRestore() {
    if (!this.filePath) return false;
    let saved;
    try {
      saved = JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch {
      return false; // 파일 없음 → 페어링 필요
    }
    if (!saved.refresh_token) return false;

    // ① 아직 유효 → 그대로 복구(토큰 굽지 않음).
    if (typeof saved.expires_at === 'number' && Date.now() < saved.expires_at - 60_000) {
      this.s = saved;
      return true;
    }

    // ② 만료 → refresh. 실패는 영구/일시 구분.
    try {
      this.s = await refresh(this.supabaseUrl, this.anonKey, saved.refresh_token);
      await this._persist();
      return true;
    } catch (e) {
      if (isPermanentAuthError(e)) return false; // 토큰 폐기 → 재페어링
      throw e;                                    // 일시 오류 → 상위 재시도
    }
  }
  async _persist() {
    if (this.filePath && this.s) {
      try { await writeFile(this.filePath, JSON.stringify(this.s, null, 2)); } catch { /* ignore */ }
    }
  }
  async token() {
    if (!this.s) throw new Error('세션 없음 — loadOrLogin 먼저 호출');
    if (Date.now() > this.s.expires_at - 60_000) {
      // ★ single-flight refresh — 근본 수정.
      //   워커 heartbeat·썸네일 pull·LLM pull·품절모니터 루프가 이 Session 하나를 공유하며
      //   동시에 token() 을 호출한다. 만료 시 각자 refresh() 를 돌리면 같은 refresh_token 으로
      //   중복 회전(rotation)이 일어나고, Supabase 가 재사용을 탐지해 토큰 패밀리 전체를 폐기한다
      //   → 세션이 영구히 깨져 모든 호출이 401 ("잘 되다 갑자기 전부 401"의 원인).
      //   진행 중인 refresh 를 하나로 합쳐(=single-flight) 직렬화하면 중복 회전이 사라진다.
      if (!this._refreshing) {
        this._refreshing = refresh(this.supabaseUrl, this.anonKey, this.s.refresh_token)
          .then(async (ns) => { this.s = ns; await this._persist(); })
          .finally(() => { this._refreshing = null; });
      }
      await this._refreshing;
    }
    return this.s.access_token;
  }
}

/** RPC 호출 (POST /rest/v1/rpc/<fn>) */
export async function rpc(session, fn, args) {
  const token = await session.token();
  return postJson(
    `${session.supabaseUrl}/rest/v1/rpc/${fn}`,
    authHeaders(session.anonKey, token),
    args,
  );
}

/** 행 부분 업데이트 (PATCH /rest/v1/<table>?<filter>) */
export async function patchRow(session, table, filter, patch) {
  const token = await session.token();
  const res = await fetch(`${session.supabaseUrl}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...authHeaders(session.anonKey, token), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH ${table} 실패: ${res.status} ${await res.text().catch(() => '')}`);
}

/** 행 조회 (GET /rest/v1/<table>?<query>). query 에 select=, 필터, order 등 포함. */
export async function selectRows(session, table, query) {
  const token = await session.token();
  const res = await fetch(`${session.supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: authHeaders(session.anonKey, token),
  });
  if (!res.ok) throw new Error(`GET ${table} 실패: ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

/**
 * 행 삽입 (POST /rest/v1/<table>). upsert=true 면 중복키 병합(merge-duplicates).
 * @returns {Promise<any>} return=representation 이면 삽입된 행들
 */
export async function insertRows(session, table, rows, { upsert = false, returning = false } = {}) {
  const token = await session.token();
  const prefer = [
    upsert ? 'resolution=merge-duplicates' : null,
    returning ? 'return=representation' : 'return=minimal',
  ].filter(Boolean).join(',');
  const res = await fetch(`${session.supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...authHeaders(session.anonKey, token), 'Content-Type': 'application/json', Prefer: prefer },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`POST ${table} 실패: ${res.status} ${await res.text().catch(() => '')}`);
  return returning ? res.json() : null;
}

/** Storage 업로드 → 공개 URL 반환 */
export async function uploadToStorage(session, bucket, path, buffer, contentType) {
  const token = await session.token();
  const res = await fetch(`${session.supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      ...authHeaders(session.anonKey, token),
      'Content-Type': contentType,
      'x-upsert': 'true',
      'cache-control': '31536000',
    },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Storage 업로드 실패: ${res.status} ${await res.text().catch(() => '')}`);
  return `${session.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
