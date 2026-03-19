import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCsResponse } from '@/lib/megaload/services/ai.service';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { inquiryId, content } = await request.json();

  if (!content) {
    return NextResponse.json({ error: '문의 내용이 필요합니다' }, { status: 400 });
  }

  // AI 답변 초안 생성
  const result = await generateCsResponse(content);

  if (result.content) {
    // AI 초안을 DB에 저장
    await supabase
      .from('sh_cs_inquiries')
      .update({ ai_draft_answer: result.content })
      .eq('id', inquiryId);
  }

  return NextResponse.json({
    draft: result.content,
    creditsUsed: result.creditsUsed,
  });
}
