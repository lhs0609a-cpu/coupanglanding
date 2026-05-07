import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { validateExifMetadataServer } from '@/lib/utils/exif-validation-server';

export const maxDuration = 30;


const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 2. FormData 파싱
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const ptUserId = formData.get('ptUserId') as string | null;
    const yearMonth = formData.get('yearMonth') as string | null;
    const type = formData.get('type') as string | null; // 'revenue' | 'ad'

    if (!file || !ptUserId || !yearMonth || !type) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 });
    }

    // 3. 파일 타입/크기 검증
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'JPEG, PNG, GIF, WebP 이미지만 업로드할 수 있습니다.' }, { status: 400 });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: '파일 크기는 10MB 이하여야 합니다.' }, { status: 400 });
    }

    // 4. EXIF 검증 (서버 사이드)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const exifResult = await validateExifMetadataServer(buffer);

    if (!exifResult.isValid) {
      return NextResponse.json(
        { error: exifResult.warningMessage || 'EXIF 검증 실패', exifResult },
        { status: 422 }
      );
    }

    // 5. Supabase Storage 업로드 (service role)
    const serviceClient = await createServiceClient();
    const fileExt = file.name.split('.').pop();
    const suffix = type === 'ad' ? '_ad' : '';
    const filePath = `${ptUserId}/${yearMonth}${suffix}.${fileExt}`;

    const { error: uploadError } = await serviceClient.storage
      .from('revenue-screenshots')
      .upload(filePath, buffer, {
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      return NextResponse.json({ error: '파일 업로드에 실패했습니다.' }, { status: 500 });
    }

    const { data: urlData } = serviceClient.storage
      .from('revenue-screenshots')
      .getPublicUrl(filePath);

    return NextResponse.json({
      url: urlData.publicUrl,
      exifResult,
    });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
