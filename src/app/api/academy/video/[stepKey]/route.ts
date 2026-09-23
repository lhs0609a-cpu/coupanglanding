import { NextResponse } from 'next/server';
import { getStep } from '@/lib/data/academy';
import { getAcademyContext } from '@/lib/academy/context';

export const maxDuration = 10;
export const dynamic = 'force-dynamic';

/** 자체 호스팅 영상 챕터가 들어있는 버킷. 비공개다. */
export const VIDEO_BUCKET = 'academy-video';

/**
 * GET /api/academy/video/[stepKey]
 *
 * 스텝 영상 챕터의 서명 URL 을 준다. 없으면 **204** — TTS 와 같은 규칙이다.
 * 영상이 없는 스텝이 대부분이고, 없는 게 오류가 아니라 정상 상태다.
 * 화면은 204 를 보고 그냥 영상 영역을 그리지 않는다.
 *
 * ★ 버킷을 비공개로 두는 이유: 이 영상들은 실제 수강생과의 1:1 통화 녹화를
 *   잘라낸 것이다. 화면 밖 개인 흔적(북마크·탭·작업표시줄)은 크롭으로 걷어냈지만,
 *   안에 남은 소싱처·상품 정보까지 URL 만 알면 아무나 보는 상태로 둘 이유가 없다.
 */
export async function GET(_req: Request, ctxParam: { params: Promise<{ stepKey: string }> }) {
  const { stepKey } = await ctxParam.params;

  const step = getStep(stepKey);
  if (!step) return NextResponse.json({ error: '없는 단계입니다.' }, { status: 404 });
  if (!step.video?.src) return new NextResponse(null, { status: 204 });

  const res = await getAcademyContext();
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const { ctx } = res;

  // 서명 URL 유효기간은 한 시간. 한 스텝을 보다가 만료되는 일은 없고,
  // 링크가 새어나가도 오래 살아있지 않다.
  const { data: signed, error } = await ctx.service
    .storage.from(VIDEO_BUCKET)
    .createSignedUrl(`${stepKey}.mp4`, 60 * 60);

  if (error || !signed?.signedUrl) return new NextResponse(null, { status: 204 });

  return NextResponse.json({
    url: signed.signedUrl,
    // 클립은 이미 그 구간만 잘라 올렸으므로 재생 구간을 따로 잡을 필요가 없다.
    // startSec/endSec 는 원본에서 어디를 가져왔는지 기록용으로만 쓴다.
    transcript: step.video.transcript,
  });
}
