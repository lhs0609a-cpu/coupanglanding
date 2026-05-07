import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;


const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

// GET: 특정 아티클의 이미지 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get('articleId');

    if (!articleId) {
      return NextResponse.json({ error: 'articleId가 필요합니다.' }, { status: 400 });
    }

    const supabase = await createClient();
    const [{ data, error }, { data: hiddenData, error: hiddenError }] = await Promise.all([
      supabase
        .from('guide_step_images')
        .select('*')
        .eq('article_id', articleId)
        .order('step_index')
        .order('display_order'),
      supabase
        .from('hidden_guide_images')
        .select('step_index, image_index')
        .eq('article_id', articleId),
    ]);

    if (error) throw error;
    if (hiddenError) throw hiddenError;

    return NextResponse.json({
      images: data || [],
      hiddenStaticImages: hiddenData || [],
    });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST: 이미지 업로드
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // admin 확인
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const articleId = formData.get('articleId') as string | null;
    const stepIndex = formData.get('stepIndex') as string | null;
    const altText = (formData.get('altText') as string) || '';
    const caption = (formData.get('caption') as string) || '';

    if (!file || !articleId || stepIndex === null) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'JPEG, PNG, GIF, WebP만 가능합니다.' }, { status: 400 });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: '10MB 이하만 가능합니다.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const serviceClient = await createServiceClient();
    const fileExt = file.name.split('.').pop();
    const fileName = `${articleId}/step${stepIndex}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await serviceClient.storage
      .from('guide-images')
      .upload(fileName, buffer, { upsert: true, contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ error: '파일 업로드 실패: ' + uploadError.message }, { status: 500 });
    }

    const { data: urlData } = serviceClient.storage
      .from('guide-images')
      .getPublicUrl(fileName);

    // 현재 최대 display_order 조회
    const { data: maxOrder } = await serviceClient
      .from('guide_step_images')
      .select('display_order')
      .eq('article_id', articleId)
      .eq('step_index', parseInt(stepIndex))
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.display_order ?? -1) + 1;

    const { data: inserted, error: dbError } = await serviceClient
      .from('guide_step_images')
      .insert({
        article_id: articleId,
        step_index: parseInt(stepIndex),
        image_url: urlData.publicUrl,
        alt_text: altText,
        caption: caption || null,
        display_order: nextOrder,
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: 'DB 저장 실패' }, { status: 500 });
    }

    return NextResponse.json({ image: inserted });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE: 이미지 삭제
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('id');

    if (!imageId) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 이미지 URL로 스토리지 파일 삭제
    const { data: img } = await serviceClient
      .from('guide_step_images')
      .select('image_url')
      .eq('id', imageId)
      .single();

    if (img?.image_url) {
      const urlParts = img.image_url.split('/guide-images/');
      if (urlParts[1]) {
        await serviceClient.storage.from('guide-images').remove([urlParts[1]]);
      }
    }

    const { error } = await serviceClient
      .from('guide_step_images')
      .delete()
      .eq('id', imageId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
