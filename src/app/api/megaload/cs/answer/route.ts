import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import type { Channel } from '@/lib/megaload/types';
import { logSystemError } from '@/lib/utils/system-log';

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
    const { inquiryId, answer } = body as {
      inquiryId: string;
      channel: Channel;
      channelInquiryId: string;
      answer: string;
    };

    if (typeof inquiryId !== 'string' || typeof answer !== 'string' || !answer.trim()) {
      return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 });
    }

    // 클라이언트가 보낸 채널 ID가 아니라 본인 소유 문의의 저장된 ID를 사용한다.
    const { data: inquiry, error: inquiryError } = await supabase.from('sh_cs_inquiries')
      .select('id, channel, channel_inquiry_id, status')
      .eq('id', inquiryId).eq('megaload_user_id', shUser.id).single();
    if (inquiryError || !inquiry) return NextResponse.json({ error: '문의를 찾을 수 없습니다.', channelSent: false }, { status: 404 });
    if (inquiry.status !== 'pending') return NextResponse.json({ error: '이미 처리된 문의입니다. 채널에서 답변을 확인하세요.', channelSent: false }, { status: 409 });
    const channel = inquiry.channel as Channel;
    const channelInquiryId = inquiry.channel_inquiry_id;
    if (!channelInquiryId) return NextResponse.json({ error: '채널 문의번호가 없습니다. 문의를 다시 가져오거나 판매자센터에서 직접 답변하세요.', channelSent: false }, { status: 409 });

    // 채널 전송 성공 전에는 답변 완료 상태를 저장하지 않는다.
    if (channelInquiryId) {
      try {
        const adapter = await getAuthenticatedAdapter(
          supabase,
          (shUser as Record<string, unknown>).id as string,
          channel
        );
        const result = await adapter.answerInquiry(channelInquiryId, answer.trim());

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

    const { error: saveError } = await supabase.from('sh_cs_inquiries').update({
      answer: answer.trim(), status: 'replied', answered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', inquiryId).eq('megaload_user_id', shUser.id);
    if (saveError) return NextResponse.json({ success: false, channelSent: true, error: '채널에는 답변이 전송됐으나 목록 저장에 실패했습니다. 재전송하지 말고 판매자센터에서 확인 후 문의를 다시 가져오세요.' }, { status: 500 });
    return NextResponse.json({ success: true, channelSent: true });
  } catch (err) {
    console.error('[cs/answer] error:', err);
    void logSystemError({ source: 'megaload/cs/answer', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
