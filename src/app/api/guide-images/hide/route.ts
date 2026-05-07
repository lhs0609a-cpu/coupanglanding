import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;


async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') return null;
  return user;
}

// POST: 기본 이미지 숨기기
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { articleId, stepIndex, imageIndex } = await request.json();

    if (!articleId || stepIndex === undefined || imageIndex === undefined) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const { error } = await serviceClient
      .from('hidden_guide_images')
      .upsert(
        { article_id: articleId, step_index: stepIndex, image_index: imageIndex },
        { onConflict: 'article_id,step_index,image_index' }
      );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE: 숨긴 기본 이미지 복원
export async function DELETE(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get('articleId');
    const stepIndex = searchParams.get('stepIndex');
    const imageIndex = searchParams.get('imageIndex');

    if (!articleId || stepIndex === null || imageIndex === null) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const { error } = await serviceClient
      .from('hidden_guide_images')
      .delete()
      .eq('article_id', articleId)
      .eq('step_index', parseInt(stepIndex))
      .eq('image_index', parseInt(imageIndex));

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
