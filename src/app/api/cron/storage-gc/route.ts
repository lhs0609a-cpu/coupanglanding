/**
 * Storage GC — product-images 버킷의 미참조 파일 정리
 *
 * GET  /api/cron/storage-gc            → 실제 삭제
 * GET  /api/cron/storage-gc?dryRun=1   → 삭제 없이 통계만
 *
 * Auth: Bearer ${CRON_SECRET}
 *
 * 동작:
 * 1) megaload_users 전체 순회
 * 2) 각 유저의 storage 폴더 (bulk/, resized/, regenerated/, stock/) 목록 조회
 * 3) 해당 유저의 referenced URL 집합 구축 (sh_product_images.image_url + sh_products.raw_data 의 image URL 들)
 * 4) 미참조 + threshold 초과 파일을 폴더별로 batch 삭제
 *
 * 안전장치:
 * - 24시간 미만 신규 파일은 절대 안 지움 (in-flight upload 보호)
 * - 폴더별 threshold 다르게 적용 (bulk: 7d, resized: 30d, regenerated: 30d, stock: 90d)
 * - bug-reports/ 는 안 건드림 (사용자 첨부, 분쟁 증거)
 * - 1회 실행당 유저별 최대 5,000 파일 / 폴더별 최대 1,000 삭제 (메모리/타임아웃 방지)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 300;

const BUCKET = 'product-images';

// 폴더별 보존 기간 (일). 이 기간 미만은 무조건 보존.
const RETENTION_DAYS: Record<string, number> = {
  browser: 3,      // 브라우저 직접 업로드 — 매핑 미뤄지면 빠른 회수
  bulk: 7,         // 대량등록 preupload — 7일 후엔 sh_product_images 매핑 안 됐으면 고아
  resized: 30,     // 쿠팡 규격용 리사이징본
  regenerated: 30, // AI 재생성 결과
  stock: 90,       // 스톡 이미지 (재사용 빈도 고려해 길게)
};

// userId 없이 megaload/browser/ 로 들어가는 레거시 경로 — 글로벌 1패스 처리
const GLOBAL_BROWSER_FOLDER = 'megaload/browser';
const GLOBAL_BROWSER_RETENTION_DAYS = 3;
const MAX_GLOBAL_BROWSER_LIST = 50000;
const MAX_GLOBAL_BROWSER_DELETE = 5000;

// 절대 안 건드리는 폴더 (사용자 첨부 등)
const PROTECTED_FOLDERS = new Set(['bug-reports']);

// 안전 한도
const MAX_LIST_PER_FOLDER = 5000;
const MAX_DELETE_PER_FOLDER = 1000;
const LIST_PAGE_SIZE = 1000;
const SOFT_DEADLINE_MS = 240_000; // maxDuration 300s 중 60s 여유

interface FolderStats {
  scanned: number;
  protectedRecent: number;   // 24시간/threshold 내라 보존
  referenced: number;         // DB 참조 있어 보존
  toDelete: number;           // 삭제 대상
  deleted: number;            // 실제 삭제됨
  errors: number;
}

interface UserStats {
  userId: string;
  folders: Record<string, FolderStats>;
  totalDeleted: number;
}

function makeFolderStats(): FolderStats {
  return { scanned: 0, protectedRecent: 0, referenced: 0, toDelete: 0, deleted: 0, errors: 0 };
}

/**
 * 한 폴더의 파일들을 페이지네이션으로 모두 나열
 * Supabase storage list() 는 최대 1000건 반환.
 */
async function listAllFiles(
  serviceClient: SupabaseClient,
  folderPath: string,
): Promise<{ name: string; created_at?: string; updated_at?: string }[]> {
  const all: { name: string; created_at?: string; updated_at?: string }[] = [];
  let offset = 0;
  while (all.length < MAX_LIST_PER_FOLDER) {
    const { data, error } = await serviceClient.storage.from(BUCKET).list(folderPath, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: 'created_at', order: 'asc' },
    });
    if (error || !data || data.length === 0) break;
    for (const item of data) {
      // 폴더는 name만 있고 metadata 없음 — 파일만 수집
      if (item.name && (item as { metadata?: unknown }).metadata) {
        all.push({
          name: item.name,
          created_at: (item as { created_at?: string }).created_at,
          updated_at: (item as { updated_at?: string }).updated_at,
        });
      }
    }
    if (data.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }
  return all;
}

/**
 * 한 유저가 sh_product_images 와 sh_products.raw_data 에서 참조하는 모든 URL 의 storage path 부분만 추출
 * URL 패턴: https://<project>.supabase.co/storage/v1/object/public/product-images/megaload/{userId}/{folder}/{uuid}.{ext}
 *           → 경로의 'megaload/{userId}/...' 부분이 storagePath
 */
function extractStoragePath(url: string, userId: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const marker = `/product-images/megaload/${userId}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + '/product-images/'.length);
}

/** raw_data JSONB 안의 모든 string 값에서 해당 유저의 storage path 추출 */
function harvestPathsFromRawData(
  rd: unknown,
  userId: string,
  refs: Set<string>,
): void {
  if (!rd) return;
  const stack: unknown[] = [rd];
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v === 'string') {
      const p = extractStoragePath(v, userId);
      if (p) refs.add(p);
    } else if (Array.isArray(v)) {
      stack.push(...v);
    } else if (v && typeof v === 'object') {
      stack.push(...Object.values(v as Record<string, unknown>));
    }
  }
}

async function buildReferencedSet(
  serviceClient: SupabaseClient,
  shUserId: string,
): Promise<Set<string>> {
  const refs = new Set<string>();

  // 1) 이 유저의 모든 product id 확보 + raw_data 동시 수집
  const { data: products } = await serviceClient
    .from('sh_products')
    .select('id, raw_data')
    .eq('megaload_user_id', shUserId);

  const productIds: string[] = [];
  for (const row of (products || []) as Array<{ id: string; raw_data?: unknown }>) {
    productIds.push(row.id);
    harvestPathsFromRawData(row.raw_data, shUserId, refs);
  }

  if (productIds.length === 0) return refs;

  // 2) sh_product_images.image_url + cdn_url
  //    1000 IDs 씩 chunk 로 안전하게 조회
  for (let i = 0; i < productIds.length; i += 1000) {
    const chunk = productIds.slice(i, i + 1000);
    const { data: imgs } = await serviceClient
      .from('sh_product_images')
      .select('image_url, cdn_url')
      .in('product_id', chunk);
    for (const row of (imgs || []) as Array<{ image_url?: string; cdn_url?: string }>) {
      for (const u of [row.image_url, row.cdn_url]) {
        if (!u) continue;
        const p = extractStoragePath(u, shUserId);
        if (p) refs.add(p);
      }
    }
  }

  // 3) sh_product_options.raw_data (옵션 이미지 — 보수적 전수 스캔)
  for (let i = 0; i < productIds.length; i += 1000) {
    const chunk = productIds.slice(i, i + 1000);
    const { data: opts } = await serviceClient
      .from('sh_product_options')
      .select('raw_data')
      .in('product_id', chunk);
    for (const row of (opts || []) as Array<{ raw_data?: unknown }>) {
      harvestPathsFromRawData(row.raw_data, shUserId, refs);
    }
  }

  return refs;
}

async function gcFolder(
  serviceClient: SupabaseClient,
  shUserId: string,
  folder: string,
  retentionDays: number,
  referenced: Set<string>,
  dryRun: boolean,
): Promise<FolderStats> {
  const stats = makeFolderStats();
  const folderPath = `megaload/${shUserId}/${folder}`;

  const files = await listAllFiles(serviceClient, folderPath);
  stats.scanned = files.length;
  if (files.length === 0) return stats;

  const now = Date.now();
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const minRecentMs = 24 * 60 * 60 * 1000; // 24시간 미만은 무조건 보존

  const toDelete: string[] = [];
  for (const f of files) {
    const fullPath = `${folderPath}/${f.name}`;
    const ts = f.created_at ? Date.parse(f.created_at) : 0;
    const ageMs = ts ? (now - ts) : 0;

    if (!ts || ageMs < minRecentMs) {
      stats.protectedRecent++;
      continue;
    }
    if (referenced.has(fullPath)) {
      stats.referenced++;
      continue;
    }
    if (ageMs < retentionMs) {
      stats.protectedRecent++;
      continue;
    }
    toDelete.push(fullPath);
    if (toDelete.length >= MAX_DELETE_PER_FOLDER) break;
  }
  stats.toDelete = toDelete.length;

  if (dryRun || toDelete.length === 0) return stats;

  // batch 100개씩 삭제
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const { error } = await serviceClient.storage.from(BUCKET).remove(batch);
    if (error) {
      console.warn(`[storage-gc] remove failed for ${folder}:`, error.message);
      stats.errors += batch.length;
    } else {
      stats.deleted += batch.length;
    }
  }

  return stats;
}

/**
 * 글로벌 megaload/browser/ (userId prefix 없는 레거시 경로) 1회 처리
 * - 모든 sh_product_images.image_url|cdn_url + sh_products.raw_data + sh_product_options.raw_data
 *   에서 megaload/browser/ 참조 path 집합 수집
 * - 미참조 + 24h 초과 + retention 초과 파일을 batch 삭제
 */
async function gcGlobalBrowserFolder(
  serviceClient: SupabaseClient,
  dryRun: boolean,
  msFn: () => number,
): Promise<{ scanned: number; referenced: number; recent: number; retention: number; toDelete: number; deleted: number; errors: number }> {
  const stats = { scanned: 0, referenced: 0, recent: 0, retention: 0, toDelete: 0, deleted: 0, errors: 0 };

  // 1) 글로벌 referenced set 구축
  const refs = new Set<string>();
  const extractBrowserPath = (url: unknown): string | null => {
    if (typeof url !== 'string' || !url) return null;
    const marker = '/product-images/megaload/browser/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.substring(idx + '/product-images/'.length).split('?')[0];
  };
  const harvest = (v: unknown): void => {
    if (!v) return;
    const stack: unknown[] = [v];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (typeof cur === 'string') {
        const p = extractBrowserPath(cur);
        if (p) refs.add(p);
      } else if (Array.isArray(cur)) {
        stack.push(...cur);
      } else if (cur && typeof cur === 'object') {
        stack.push(...Object.values(cur as Record<string, unknown>));
      }
    }
  };

  // sh_product_images
  for (let from = 0; ; from += 1000) {
    if (msFn() > SOFT_DEADLINE_MS - 60_000) break;
    const { data } = await serviceClient
      .from('sh_product_images')
      .select('image_url, cdn_url')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ image_url?: string; cdn_url?: string }>) {
      const p1 = extractBrowserPath(row.image_url);
      const p2 = extractBrowserPath(row.cdn_url);
      if (p1) refs.add(p1);
      if (p2) refs.add(p2);
    }
    if (data.length < 1000) break;
  }
  // sh_products.raw_data
  for (let from = 0; ; from += 1000) {
    if (msFn() > SOFT_DEADLINE_MS - 60_000) break;
    const { data } = await serviceClient
      .from('sh_products')
      .select('raw_data')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ raw_data?: unknown }>) harvest(row.raw_data);
    if (data.length < 1000) break;
  }
  // sh_product_options.raw_data
  for (let from = 0; ; from += 1000) {
    if (msFn() > SOFT_DEADLINE_MS - 60_000) break;
    const { data } = await serviceClient
      .from('sh_product_options')
      .select('raw_data')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ raw_data?: unknown }>) harvest(row.raw_data);
    if (data.length < 1000) break;
  }

  console.log(`[storage-gc:global-browser] refs=${refs.size}, after_ref_build_ms=${msFn()}`);

  // 2) 파일 페이지네이션 + 분류 + 삭제
  const now = Date.now();
  const minRecentMs = 24 * 60 * 60 * 1000;
  const retentionMs = GLOBAL_BROWSER_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const deleteBuf: string[] = [];
  let listOffset = 0;

  const flushDelete = async () => {
    if (deleteBuf.length === 0 || dryRun) {
      deleteBuf.length = 0;
      return;
    }
    while (deleteBuf.length > 0) {
      const chunk = deleteBuf.splice(0, 100);
      const { error } = await serviceClient.storage.from(BUCKET).remove(chunk);
      if (error) {
        console.warn(`[storage-gc:global-browser] remove failed:`, error.message);
        stats.errors += chunk.length;
      } else {
        stats.deleted += chunk.length;
      }
    }
  };

  while (stats.scanned < MAX_GLOBAL_BROWSER_LIST) {
    if (msFn() > SOFT_DEADLINE_MS) break;
    const { data, error } = await serviceClient.storage.from(BUCKET).list(GLOBAL_BROWSER_FOLDER, {
      limit: 1000,
      offset: listOffset,
      sortBy: { column: 'created_at', order: 'asc' },
    });
    if (error || !data || data.length === 0) break;

    for (const item of data) {
      if (!(item as { metadata?: unknown }).metadata) continue;
      stats.scanned++;

      const path = `${GLOBAL_BROWSER_FOLDER}/${item.name}`;
      const ts = (item as { created_at?: string }).created_at
        ? Date.parse((item as { created_at?: string }).created_at!)
        : 0;
      const ageMs = ts ? now - ts : 0;

      if (!ts || ageMs < minRecentMs) { stats.recent++; continue; }
      if (refs.has(path)) { stats.referenced++; continue; }
      if (ageMs < retentionMs) { stats.retention++; continue; }

      if (stats.toDelete < MAX_GLOBAL_BROWSER_DELETE) {
        stats.toDelete++;
        deleteBuf.push(path);
        if (deleteBuf.length >= 500) await flushDelete();
      }
    }

    if (data.length < 1000) break;
    listOffset += 1000;
    if (stats.toDelete >= MAX_GLOBAL_BROWSER_DELETE) break;
  }

  await flushDelete();
  console.log(`[storage-gc:global-browser] DONE scanned=${stats.scanned} ref=${stats.referenced} recent=${stats.recent} retention=${stats.retention} deleted=${stats.deleted}`);
  return stats;
}

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  const ms = () => Date.now() - t0;

  // Vercel cron 인증
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const serviceClient = await createServiceClient();

    // 활성 megaload_users 전체 (deleted 제외)
    const { data: users, error: userErr } = await serviceClient
      .from('megaload_users')
      .select('id')
      .order('created_at', { ascending: false });

    if (userErr) throw userErr;

    const userStats: UserStats[] = [];
    let totalDeleted = 0;
    let totalErrors = 0;

    for (const u of (users || []) as Array<{ id: string }>) {
      if (ms() > SOFT_DEADLINE_MS) {
        console.warn(`[storage-gc] soft deadline reached at ${ms()}ms — stopping early`);
        break;
      }

      const shUserId = u.id;
      const stats: UserStats = { userId: shUserId, folders: {}, totalDeleted: 0 };

      // 참조 집합 구축 (한 번)
      let referenced: Set<string>;
      try {
        referenced = await buildReferencedSet(serviceClient, shUserId);
      } catch (err) {
        console.error(`[storage-gc] buildReferencedSet failed for ${shUserId}:`, err);
        continue; // 이 유저 skip — 참조 못 구하면 위험해서 절대 삭제 안 함
      }

      for (const [folder, days] of Object.entries(RETENTION_DAYS)) {
        if (PROTECTED_FOLDERS.has(folder)) continue;
        try {
          const folderStats = await gcFolder(
            serviceClient,
            shUserId,
            folder,
            days,
            referenced,
            dryRun,
          );
          stats.folders[folder] = folderStats;
          stats.totalDeleted += folderStats.deleted;
          totalDeleted += folderStats.deleted;
          totalErrors += folderStats.errors;
        } catch (err) {
          console.error(`[storage-gc] folder ${folder} failed for ${shUserId}:`, err);
          stats.folders[folder] = { ...makeFolderStats(), errors: 1 };
          totalErrors++;
        }
      }

      // 결과 있는 유저만 응답에 포함 (응답 크기 절약)
      if (stats.totalDeleted > 0 || Object.values(stats.folders).some((f) => f.scanned > 0)) {
        userStats.push(stats);
      }
    }

    // 글로벌 megaload/browser/ (userId prefix 없는 레거시 경로) 1회 처리
    let globalBrowserStats: Awaited<ReturnType<typeof gcGlobalBrowserFolder>> | null = null;
    if (ms() < SOFT_DEADLINE_MS) {
      try {
        globalBrowserStats = await gcGlobalBrowserFolder(serviceClient, dryRun, ms);
        totalDeleted += globalBrowserStats.deleted;
        totalErrors += globalBrowserStats.errors;
      } catch (err) {
        console.error(`[storage-gc] global-browser failed:`, err);
        totalErrors++;
      }
    }

    console.log(`[storage-gc] DONE ${ms()}ms — deleted=${totalDeleted}, errors=${totalErrors}, dryRun=${dryRun}`);

    return NextResponse.json({
      success: true,
      dryRun,
      elapsed_ms: ms(),
      summary: {
        users_processed: userStats.length,
        total_deleted: totalDeleted,
        total_errors: totalErrors,
      },
      users: userStats,
      global_browser: globalBrowserStats,
    });
  } catch (err) {
    console.error(`[storage-gc] error at ${ms()}ms:`, err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'storage-gc 실패',
        elapsed_ms: ms(),
      },
      { status: 500 },
    );
  }
}
