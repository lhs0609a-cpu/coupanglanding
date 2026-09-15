import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 👍/👎 평가.
 *
 * 👎 가 쌓인 대화가 곧 "봇이 못 푼 질문 목록"이고, 그게 지식베이스를 보강하는 입력이 된다.
 * /admin/assistant 에서 이 목록을 본다.
 */
export async function POST(request: NextRequest) {
  let body: { conversationId?: string; rating?: number; anonKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const conversationId = body.conversationId;
  const rating = body.rating === 1 ? 1 : body.rating === -1 ? -1 : 0;
  if (!conversationId || !rating) {
    return NextResponse.json({ error: 'conversationId 와 rating 이 필요합니다.' }, { status: 400 });
  }

  let profileId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    profileId = user?.id ?? null;
  } catch {
    profileId = null;
  }

  try {
    const serviceClient: any = await createServiceClient();

    // 본인 대화인지 확인 — 남의 대화 평가를 막는다
    const { data: conv } = await serviceClient
      .from('assistant_conversations')
      .select('id, profile_id, anon_key, helpful_count, unhelpful_count')
      .eq('id', conversationId)
      .maybeSingle();

    if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 });

    const owned =
      (profileId && conv.profile_id === profileId) ||
      (!!body.anonKey && conv.anon_key === body.anonKey);
    if (!owned) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    await serviceClient
      .from('assistant_conversations')
      .update(
        rating === 1
          ? { helpful_count: (conv.helpful_count ?? 0) + 1 }
          : { unhelpful_count: (conv.unhelpful_count ?? 0) + 1 },
      )
      .eq('id', conversationId);

    // 가장 최근 봇 답변에 평가를 붙인다
    const { data: last } = await serviceClient
      .from('assistant_messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1);
    const lastId = (last || [])[0]?.id;
    if (lastId) {
      await serviceClient.from('assistant_messages').update({ rating }).eq('id', lastId);
    }

    return NextResponse.json({ ok: true });
  } catch {
    // 평가 실패로 사용자에게 오류를 보여줄 이유는 없다
    return NextResponse.json({ ok: true });
  }
}
