import crypto from 'crypto';

/**
 * Google Drive service account 클라이언트.
 *
 * 환경변수:
 *   - GOOGLE_DRIVE_SA_KEY: service account JSON 전체 (문자열)
 *   - GOOGLE_DRIVE_ROOT_FOLDER_ID: 카탈로그 루트 폴더 ID (관리자가 service account에 공유)
 *
 * 외부 의존성 없음 — Node crypto로 RS256 JWT 직접 서명, REST 호출은 fetch.
 * 토큰은 메모리에 1시간 캐싱.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let cachedKey: ServiceAccountKey | null = null;

function loadServiceAccountKey(): ServiceAccountKey {
  if (cachedKey) return cachedKey;
  const raw = process.env.GOOGLE_DRIVE_SA_KEY;
  if (!raw) {
    throw new Error('GOOGLE_DRIVE_SA_KEY env var is not set');
  }
  let parsed: ServiceAccountKey;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_DRIVE_SA_KEY is not valid JSON');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_DRIVE_SA_KEY missing client_email or private_key');
  }
  // private_key가 환경변수에 들어갈 때 \n이 literal로 들어오는 케이스 처리
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  cachedKey = parsed;
  return parsed;
}

export function getDriveRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!id) {
    throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID env var is not set');
  }
  return id;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function buildJwt(key: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: key.client_email,
    scope: DRIVE_SCOPE,
    aud: key.token_uri || TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = base64url(JSON.stringify(header));
  const claimB64 = base64url(JSON.stringify(claim));
  const signingInput = `${headerB64}.${claimB64}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .sign(key.private_key);
  return `${signingInput}.${base64url(signature)}`;
}

async function fetchAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }
  const key = loadServiceAccountKey();
  const jwt = buildJwt(key);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  const res = await fetch(key.token_uri || TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

async function driveFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await fetchAccessToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${DRIVE_API}${path}`, { ...init, headers });
}

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  webContentLink?: string;
  imageMediaMetadata?: { width?: number; height?: number };
}

export interface ListFilesOptions {
  /** Drive query string (q parameter). Default 필터와 AND로 묶임 */
  query?: string;
  /** 페이지 토큰 */
  pageToken?: string;
  /** 페이지 크기 (max 1000) */
  pageSize?: number;
  /** 추가 필드 */
  fields?: string;
}

export interface ListFilesResult {
  files: DriveFile[];
  nextPageToken?: string;
}

const DEFAULT_FILE_FIELDS =
  'id,name,mimeType,size,modifiedTime,thumbnailLink,webContentLink,imageMediaMetadata(width,height)';

/** 특정 부모 폴더의 직속 자식 나열 (folder/file 구분 없이). */
export async function listChildren(
  parentId: string,
  options: ListFilesOptions = {}
): Promise<ListFilesResult> {
  const baseQuery = `'${parentId}' in parents and trashed = false`;
  const q = options.query ? `${baseQuery} and (${options.query})` : baseQuery;
  const params = new URLSearchParams({
    q,
    fields: `nextPageToken, files(${options.fields || DEFAULT_FILE_FIELDS})`,
    pageSize: String(options.pageSize || 1000),
    orderBy: 'name',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  if (options.pageToken) params.set('pageToken', options.pageToken);

  const res = await driveFetch(`/files?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive listChildren failed: ${res.status} ${text}`);
  }
  return (await res.json()) as ListFilesResult;
}

/** 폴더 자식 전체 페이지네이션 순회. */
export async function listAllChildren(
  parentId: string,
  options: Omit<ListFilesOptions, 'pageToken'> = {}
): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const result = await listChildren(parentId, { ...options, pageToken });
    all.push(...result.files);
    pageToken = result.nextPageToken;
  } while (pageToken);
  return all;
}

/** 단일 파일/폴더 메타. */
export async function getFile(
  fileId: string,
  fields = DEFAULT_FILE_FIELDS
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields,
    supportsAllDrives: 'true',
  });
  const res = await driveFetch(`/files/${fileId}?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive getFile failed: ${res.status} ${text}`);
  }
  return (await res.json()) as DriveFile;
}

/** 파일 원본 바이너리 다운로드. 등록 시점에만 호출 (대용량). */
export async function downloadFile(fileId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  size: number;
}> {
  const params = new URLSearchParams({ alt: 'media', supportsAllDrives: 'true' });
  const res = await driveFetch(`/files/${fileId}?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive downloadFile failed: ${res.status} ${text}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  return {
    buffer,
    mimeType: res.headers.get('content-type') || 'application/octet-stream',
    size: buffer.length,
  };
}

/**
 * 폴더 직속 하위 폴더만 (각 상품 폴더). 카탈로그 sync에서 루트→상품폴더 나열.
 */
export async function listSubfolders(
  parentId: string,
  options: { pageToken?: string; pageSize?: number } = {}
): Promise<ListFilesResult> {
  return listChildren(parentId, {
    query: "mimeType = 'application/vnd.google-apps.folder'",
    fields: 'id,name,modifiedTime',
    pageToken: options.pageToken,
    pageSize: options.pageSize,
  });
}

/** 폴더 내 이미지 파일만. */
export async function listImagesInFolder(folderId: string): Promise<DriveFile[]> {
  return listAllChildren(folderId, {
    query: "mimeType contains 'image/'",
  });
}

/**
 * 토큰 캐시 강제 무효화 (테스트/장애 복구용).
 */
export function resetTokenCache(): void {
  cachedToken = null;
  cachedKey = null;
}
