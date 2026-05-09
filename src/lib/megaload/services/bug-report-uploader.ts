/**
 * 버그리포트 첨부 이미지 — 클라이언트 → Supabase Storage 직접 업로드.
 *
 * 기존: 브라우저 → Vercel API(/api/megaload/bug-reports/upload) → Supabase Storage
 *      → 함수 콜드스타트 + 파일 바이트가 Vercel 거쳐가서 1.5~3초 + Fluid Compute 비용.
 *
 * 변경: 브라우저 → Supabase Storage 직접 (인증 anon key + RLS).
 *      → 0.3~0.8초, Vercel 비용 0.
 *      RLS: bucket_id='product-images' + role='authenticated' → 모든 인증사용자 허용.
 *
 * 실패 시 기존 API 라우트로 폴백 (RLS/네트워크 이슈 회복력).
 */

import { createClient } from '@/lib/supabase/client';

export interface BugReportUploadResult {
  url: string;
  name: string;
  size: number;
}

const ALLOWED_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB — 서버 라우트와 동일

function makeStoragePath(userId: string, originalName: string): string {
  const extMatch = originalName.match(ALLOWED_EXT);
  const ext = (extMatch?.[1] || 'jpg').toLowerCase();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `megaload/${userId}/bug-reports/${id}.${ext}`;
}

function inferContentType(name: string): string {
  const ext = name.match(ALLOWED_EXT)?.[1]?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * 1차 직접 업로드 → 실패 시 API 폴백.
 * 호출자는 알림 처리 (이 함수는 throw 또는 null 반환).
 */
export async function uploadBugReportImage(file: File): Promise<BugReportUploadResult | null> {
  if (file.size > MAX_SIZE) {
    throw new Error(`파일 크기가 10MB를 초과합니다 (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  }
  if (!ALLOWED_EXT.test(file.name)) {
    throw new Error('허용되지 않는 파일 형식입니다 (jpg, png, webp, gif).');
  }

  // ── 1차: 직접 업로드 ──
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const storagePath = makeStoragePath(user.id, file.name);
      const contentType = inferContentType(file.name);

      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(storagePath, file, { contentType, cacheControl: '31536000', upsert: false });

      if (!error && data) {
        const { data: pub } = supabase.storage.from('product-images').getPublicUrl(storagePath);
        if (pub?.publicUrl) {
          return { url: pub.publicUrl, name: file.name, size: file.size };
        }
      }
      // RLS 거부/네트워크 일시 장애 → 폴백 진행
      if (error) {
        console.warn('[bug-report-upload] 직접 업로드 실패 → API 폴백:', error.message);
      }
    }
  } catch (e) {
    console.warn('[bug-report-upload] 직접 업로드 예외 → API 폴백:', e);
  }

  // ── 2차: 기존 API 라우트 폴백 ──
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/megaload/bug-reports/upload', {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  let json: { error?: string; url?: string; name?: string; size?: number };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`업로드 실패: HTTP ${res.status} — 응답이 JSON 아님 (${text.slice(0, 100)})`);
  }
  if (!res.ok) throw new Error(json.error || `업로드 실패: HTTP ${res.status}`);
  if (!json.url) throw new Error('업로드 응답에 URL 없음');
  return { url: json.url, name: json.name || file.name, size: json.size ?? file.size };
}
