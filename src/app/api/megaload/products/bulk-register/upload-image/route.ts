import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { detectImageFormat, getImageDimensions } from '@/lib/megaload/services/image-processor';

export const maxDuration = 30;


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

    let buffer = Buffer.from(await file.arrayBuffer());

    // 이미지 차원 검증 + 자동 리사이징 (쿠팡: 최소 500×500, 최대 5000×5000)
    const format = detectImageFormat(buffer);
    let dims = getImageDimensions(buffer, format);
    let finalExt = ext;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Jimp: any = null;
    const dimUnknown = dims.width === 0 || dims.height === 0;
    const needsUpscale = !dimUnknown && (dims.width < 500 || dims.height < 500);
    const needsDownscale = dims.width > 5000 || dims.height > 5000;

    if (dimUnknown || needsUpscale || needsDownscale) {
      try {
        Jimp = (await import('jimp')).default || (await import('jimp'));
      } catch { /* jimp unavailable */ }

      if (Jimp) {
        let image = await Jimp.read(buffer);
        const jW: number = image.getWidth?.() ?? image.bitmap?.width ?? 0;
        const jH: number = image.getHeight?.() ?? image.bitmap?.height ?? 0;
        if (dimUnknown && jW > 0 && jH > 0) dims = { width: jW, height: jH };
        const w = dims.width || jW;
        const h = dims.height || jH;

        if (w > 0 && h > 0 && (w < 500 || h < 500)) {
          const scale = Math.max(800 / w, 800 / h);
          image = image.resize(Math.round(w * scale), Math.round(h * scale));
        } else if (w > 5000 || h > 5000) {
          const scale = Math.min(4500 / w, 4500 / h);
          image = image.resize(Math.round(w * scale), Math.round(h * scale));
        }

        const MIME_JPEG = Jimp.MIME_JPEG || 'image/jpeg';
        let quality = 92;
        let outBuf = await image.quality(quality).getBufferAsync(MIME_JPEG);
        while (outBuf.length > 10 * 1024 * 1024 && quality > 40) {
          quality -= 10;
          outBuf = await image.quality(quality).getBufferAsync(MIME_JPEG);
        }
        buffer = Buffer.from(outBuf);
        finalExt = 'jpg';
      } else if (needsUpscale) {
        return NextResponse.json({ error: '이미지가 500×500 미만입니다.' }, { status: 400 });
      } else if (needsDownscale) {
        return NextResponse.json({ error: '이미지가 5000×5000을 초과합니다.' }, { status: 400 });
      }
    }

    const contentType =
      finalExt === 'png' ? 'image/png'
      : finalExt === 'gif' ? 'image/gif'
      : finalExt === 'webp' ? 'image/webp'
      : 'image/jpeg';

    const storagePath = `megaload/${shUserId}/bulk/${randomUUID()}.${finalExt}`;

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
