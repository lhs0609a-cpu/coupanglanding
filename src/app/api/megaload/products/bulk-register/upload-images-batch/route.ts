import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export const maxDuration = 30;


/**
 * POST — 여러 이미지 파일을 한 번에 업로드 (인증 1회만)
 * FormData: file_0, file_1, ... file_N (최대 20장)
 * 반환: { urls: string[] }
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

    // 파일 수집 (file_0, file_1, ...)
    const files: File[] = [];
    for (let i = 0; i < 20; i++) {
      const file = formData.get(`file_${i}`) as File | null;
      if (!file) break;
      files.push(file);
    }

    if (files.length === 0) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const ALLOWED_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;

    // 병렬 업로드
    const uploadPromises = files.map(async (file) => {
      try {
        if (file.size > MAX_FILE_SIZE) return '';
        const originalName = file.name || 'image.jpg';
        const extMatch = originalName.match(ALLOWED_EXT);
        if (!extMatch) return '';
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

        if (error || !data) return '';

        const { data: publicData } = serviceClient.storage
          .from('product-images')
          .getPublicUrl(storagePath);

        return publicData?.publicUrl || '';
      } catch {
        return '';
      }
    });

    const urls = await Promise.all(uploadPromises);

    return NextResponse.json({ urls });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '업로드 실패' },
      { status: 500 },
    );
  }
}
