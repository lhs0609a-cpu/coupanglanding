import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

// 명시적 타임아웃 — 기본(10s Hobby/60s Pro) 도달 시 client 가 catch 로 빠져
// "업로드 실패" alert 만 노출되고 원인 추적 불가. 25s 면 5MB PNG 업로드 + auth.getUser() + Storage upload 안전.
export const maxDuration = 30;

/**
 * POST — 오류문의 이미지 업로드
 * FormData: file (JPEG/PNG/WebP/GIF, 10MB)
 * 반환: { url, name, size }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch {
      return NextResponse.json({ error: 'Megaload 계정이 없습니다.' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `파일 크기가 10MB를 초과합니다 (${(file.size / 1024 / 1024).toFixed(1)}MB)` },
        { status: 400 },
      );
    }

    const originalName = file.name || 'image.jpg';
    const extMatch = originalName.match(/\.(jpg|jpeg|png|webp|gif)$/i);
    if (!extMatch) {
      return NextResponse.json(
        { error: '허용되지 않는 파일 형식입니다. (jpg, png, webp, gif)' },
        { status: 400 },
      );
    }
    const ext = extMatch[1].toLowerCase();

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType =
      ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : 'image/jpeg';

    const storagePath = `megaload/${shUserId}/bug-reports/${randomUUID()}.${ext}`;

    const { data, error } = await serviceClient.storage
      .from('product-images')
      .upload(storagePath, buffer, {
        contentType,
        cacheControl: '31536000',
        upsert: false,
      });

    if (error || !data) {
      return NextResponse.json(
        { error: `업로드 실패: ${error?.message}` },
        { status: 500 },
      );
    }

    const { data: publicData } = serviceClient.storage
      .from('product-images')
      .getPublicUrl(storagePath);

    return NextResponse.json({
      url: publicData.publicUrl,
      name: originalName,
      size: file.size,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '업로드 실패' },
      { status: 500 },
    );
  }
}
