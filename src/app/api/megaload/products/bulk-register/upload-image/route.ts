import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

/**
 * POST — 브라우저에서 이미지 파일을 받아 Supabase Storage에 업로드
 * FormData: file (단일 파일)
 * 반환: { url: string }
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
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });

    // 파일 크기 제한 (10MB — 쿠팡 DETAIL 이미지 최대 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `파일 크기가 10MB를 초과합니다 (${(file.size / 1024 / 1024).toFixed(1)}MB)` },
        { status: 400 },
      );
    }

    // 확장자 검증
    const originalName = file.name || 'image.jpg';
    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    const extMatch = originalName.match(/\.(jpg|jpeg|png|webp|gif)$/i);
    if (!extMatch) {
      return NextResponse.json(
        { error: `허용되지 않는 파일 형식입니다. 허용: ${ALLOWED_EXTENSIONS.join(', ')}` },
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

    const storagePath = `megaload/${shUserId}/bulk/${randomUUID()}.${ext}`;

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

    return NextResponse.json({ url: publicData.publicUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '업로드 실패' },
      { status: 500 },
    );
  }
}
