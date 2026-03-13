import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

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

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'SellerHub 계정이 없습니다.' }, { status: 404 });

    const shUserId = (shUser as Record<string, unknown>).id as string;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // 확장자 결정
    const originalName = file.name || 'image.jpg';
    const extMatch = originalName.match(/\.(jpg|jpeg|png|webp|gif)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';

    const contentType =
      ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : 'image/jpeg';

    const serviceClient = await createServiceClient();
    const storagePath = `sellerhub/${shUserId}/bulk/${randomUUID()}.${ext}`;

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
