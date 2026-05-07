import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import type { Channel } from '@/lib/megaload/types';

export const maxDuration = 30;


export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정 없음' }, { status: 403 });

    const body = await request.json();
    const { inquiryId, channel, channelInquiryId, answer } = body as {
      inquiryId: string;
      channel: Channel;
      channelInquiryId: string;
      answer: string;
    };

    if (!inquiryId || !channel || !answer) {
      return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 });
    }

    // 채널 API를 통해 답변 전송
    if (channelInquiryId) {
      try {
        const adapter = await getAuthenticatedAdapter(
          supabase,
          (shUser as Record<string, unknown>).id as string,
          channel
        );
        const result = await adapter.answerInquiry(channelInquiryId, answer);

        if (!result.success) {
          return NextResponse.json(
            { error: `${channel} 채널 답변 전송 실패`, channelSent: false },
            { status: 502 }
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '채널 API 오류';
        return NextResponse.json(
          { error: message, channelSent: false },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({ success: true, channelSent: !!channelInquiryId });
  } catch (err) {
    console.error('[cs/answer] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
