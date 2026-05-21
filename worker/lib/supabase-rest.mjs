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
  /** 저장된 세션만 복구 시도 (로그인 안 함). 성공 시 true */
  async tryRestore() {
    if (!this.filePath) return false;
    try {
      const saved = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!saved.refresh_token) return false;
      this.s = await refresh(this.supabaseUrl, this.anonKey, saved.refresh_token);
      await this._persist();
      return true;
    } catch { return false; }
  }
  async _persist() {
    if (this.filePath && this.s) {
      try { await writeFile(this.filePath, JSON.stringify(this.s, null, 2)); } catch { /* ignore */ }
    }
  }
  async token() {
    if (!this.s) throw new Error('세션 없음 — loadOrLogin 먼저 호출');
    if (Date.now() > this.s.expires_at - 60_000) {
      this.s = await refresh(this.supabaseUrl, this.anonKey, this.s.refresh_token);
      await this._persist();
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
