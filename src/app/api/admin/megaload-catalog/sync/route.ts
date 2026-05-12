import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  getDriveRootFolderId,
  listSubfolders,
  listImagesInFolder,
  listAllChildren,
  downloadFile,
  type DriveFile,
} from '@/lib/megaload/integrations/google-drive';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

interface ProductJson {
  name?: string;
  display_name?: string;
  brand?: string;
  manufacturer?: string;
  suggested_price?: number;
  cost_price?: number;
  coupang_category_code?: string;
  options?: unknown[];
  notices?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
}

function classifyImage(name: string): 'main' | 'detail' | 'option' {
  const lower = name.toLowerCase();
  if (/^(main|대표|cover)/.test(lower)) return 'main';
  if (/^(option|opt|옵션)/.test(lower)) return 'option';
  if (/^(detail|상세|content)/.test(lower)) return 'detail';
  return 'detail';
}

function imageSortKey(name: string): string {
  // 0001.jpg, main_01, detail_001 등 → 자연 정렬용 zero-pad
  return name.replace(/(\d+)/g, (n) => n.padStart(8, '0')).toLowerCase();
}

async function readProductJson(folderId: string, files: DriveFile[]): Promise<ProductJson | null> {
  const meta = files.find((f) => f.name.toLowerCase() === 'product.json');
  if (!meta) return null;
  try {
    const { buffer } = await downloadFile(meta.id);
    return JSON.parse(buffer.toString('utf-8')) as ProductJson;
  } catch (err) {
    console.warn(`[catalog-sync] product.json parse fail folder=${folderId}`, err);
    return null;
  }
}

interface SyncStats {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ folder: string; error: string }>;
}

async function syncFolder(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  folder: DriveFile,
  stats: SyncStats
): Promise<void> {
  try {
    // 1) 폴더 내 모든 자식 (이미지 + product.json)
    const allChildren = await listAllChildren(folder.id);
    const images = allChildren
      .filter((f) => f.mimeType.startsWith('image/'))
      .sort((a, b) => imageSortKey(a.name).localeCompare(imageSortKey(b.name)));

    if (images.length === 0) {
      stats.skipped++;
      return;
    }

    // 2) product.json (있으면)
    const productJson = await readProductJson(folder.id, allChildren);

    // 3) 이미지 메타 직렬화 (DB엔 ID + 썸네일링크만)
    const imagesPayload = images.map((img) => ({
      id: img.id,
      name: img.name,
      mime_type: img.mimeType,
      size: img.size ? Number(img.size) : null,
      width: img.imageMediaMetadata?.width ?? null,
      height: img.imageMediaMetadata?.height ?? null,
      thumbnail_link: img.thumbnailLink ?? null,
      kind: classifyImage(img.name),
    }));

    const mainCount = imagesPayload.filter((i) => i.kind === 'main').length || 1;
    const detailCount = imagesPayload.filter((i) => i.kind === 'detail').length;

    // 4) 기존 row 확인 (drive_modified_time 비교로 skip 가능)
    const { data: existing } = await serviceClient
      .from('catalog_products')
      .select('id, drive_modified_time')
      .eq('drive_folder_id', folder.id)
      .maybeSingle();

    if (existing && existing.drive_modified_time && folder.modifiedTime) {
      if (new Date(existing.drive_modified_time) >= new Date(folder.modifiedTime)) {
        stats.skipped++;
        return;
      }
    }

    const payload = {
      drive_folder_id: folder.id,
      drive_folder_name: folder.name,
      drive_modified_time: folder.modifiedTime ?? null,
      product_name: productJson?.name || folder.name,
      display_name: productJson?.display_name ?? null,
      brand: productJson?.brand ?? null,
      manufacturer: productJson?.manufacturer ?? null,
      coupang_category_code: productJson?.coupang_category_code ?? null,
      suggested_price: productJson?.suggested_price ?? null,
      cost_price: productJson?.cost_price ?? null,
      images: imagesPayload,
      main_image_count: mainCount,
      detail_image_count: detailCount,
      options: productJson?.options ?? [],
      notices: productJson?.notices ?? null,
      attributes: productJson?.attributes ?? null,
      raw_metadata: productJson ?? null,
    };

    if (existing) {
      const { error } = await serviceClient
        .from('catalog_products')
        .update(payload)
        .eq('id', existing.id);
      if (error) throw error;
      stats.updated++;
    } else {
      const { error } = await serviceClient
        .from('catalog_products')
        .insert({ ...payload, status: 'draft', is_visible: false });
      if (error) throw error;
      stats.inserted++;
    }
  } catch (err) {
    stats.failed++;
    const msg = err instanceof Error ? err.message : String(err);
    stats.errors.push({ folder: `${folder.name} (${folder.id})`, error: msg });
    console.error(`[catalog-sync] folder=${folder.id} failed`, err);
  }
}

/**
 * POST /api/admin/megaload-catalog/sync
 * Body: { maxFolders?: number, pageToken?: string }
 *
 * 30만 폴더 풀스캔은 한 번에 못 끝나므로 maxFolders로 끊어서 반복 호출.
 * 응답에 nextPageToken 포함 — 다음 호출에 그대로 전달.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);
  if (!adminUser) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    maxFolders?: number;
    pageToken?: string;
  };
  const maxFolders = Math.min(body.maxFolders || 200, 1000);

  const serviceClient = await createServiceClient();

  // 1) sync 작업 row 생성
  const { data: job, error: jobErr } = await serviceClient
    .from('catalog_sync_jobs')
    .insert({
      triggered_by: adminUser.id,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (jobErr || !job) {
    return NextResponse.json(
      { error: 'sync job 생성 실패', detail: jobErr?.message },
      { status: 500 }
    );
  }
  const jobId = (job as { id: string }).id;

  const stats: SyncStats = {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  let nextPageToken: string | undefined;

  try {
    const rootId = getDriveRootFolderId();

    // 2) 폴더 페이지네이션 (한 번에 maxFolders개까지)
    let processed = 0;
    let pageToken = body.pageToken;
    do {
      const remaining = maxFolders - processed;
      const pageSize = Math.min(remaining, 100);
      const page = await listSubfolders(rootId, { pageToken, pageSize });
      stats.total += page.files.length;

      for (const folder of page.files) {
        if (processed >= maxFolders) break;
        await syncFolder(serviceClient, folder, stats);
        processed++;
      }

      pageToken = page.nextPageToken;
      if (processed >= maxFolders) {
        nextPageToken = pageToken;
        break;
      }
    } while (pageToken);

    // 3) job 완료 처리
    await serviceClient
      .from('catalog_sync_jobs')
      .update({
        status: 'completed',
        total_folders: stats.total,
        inserted_count: stats.inserted,
        updated_count: stats.updated,
        skipped_count: stats.skipped,
        failed_count: stats.failed,
        error_details: stats.errors.length > 0 ? { errors: stats.errors.slice(0, 50) } : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    return NextResponse.json({
      job_id: jobId,
      stats,
      next_page_token: nextPageToken ?? null,
      done: !nextPageToken,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await serviceClient
      .from('catalog_sync_jobs')
      .update({
        status: 'failed',
        total_folders: stats.total,
        inserted_count: stats.inserted,
        updated_count: stats.updated,
        skipped_count: stats.skipped,
        failed_count: stats.failed,
        error_details: { fatal: msg, errors: stats.errors.slice(0, 50) },
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    return NextResponse.json(
      { error: msg, job_id: jobId, stats },
      { status: 500 }
    );
  }
}

/** GET — 최근 sync 작업 목록 */
export async function GET() {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);
  if (!adminUser) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }
  const serviceClient = await createServiceClient();
  const { data, error } = await serviceClient
    .from('catalog_sync_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ jobs: data || [] });
}
