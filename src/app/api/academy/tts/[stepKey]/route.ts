import { NextResponse } from 'next/server';
import { getStep } from '@/lib/data/academy';
import { getAcademyContext } from '@/lib/academy/context';
import { narrationHash, TTS_BUCKET, TTS_VOICE } from '@/lib/academy/tts';

export const maxDuration = 10;
export const dynamic = 'force-dynamic';

/**
 * GET /api/academy/tts/[stepKey]
 *
 * 사전 생성된 mp3 가 있으면 서명 URL 과 문장별 구간을 준다.
 * 없으면 **204** — 클라이언트는 그걸 신호로 브라우저 음성으로 떨어진다.
 *
 * ★ 404 가 아니라 204 인 이유: 없는 게 오류가 아니라 정상 상태다.
 *   아직 안 만든 스텝이 대부분이고, 그때도 설명은 들려야 한다.
 */
export async function GET(_req: Request, ctxParam: { params: Promise<{ stepKey: string }> }) {
  const { stepKey } = await ctxParam.params;

  const step = getStep(stepKey);
  if (!step) return NextResponse.json({ error: '없는 단계입니다.' }, { status: 404 });

  const res = await getAcademyContext();
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const { ctx } = res;

  // 지금 코드에 있는 대본의 해시로만 찾는다. 대본이 바뀌었으면 옛 mp3 는 쓰지 않는다 —
  // 화면 자막과 들리는 말이 다르면 그게 더 혼란스럽다.
  const hash = narrationHash(step.narration);

  const { data: asset } = await ctx.service
    .from('academy_tts_assets')
    .select('audio_path, marks')
    .eq('step_key', stepKey)
    .eq('script_hash', hash)
    .eq('voice', TTS_VOICE)
    .maybeSingle();

  if (!asset?.audio_path) return new NextResponse(null, { status: 204 });

  const { data: signed, error } = await ctx.service
    .storage.from(TTS_BUCKET)
    .createSignedUrl(asset.audio_path as string, 60 * 60);

  if (error || !signed?.signedUrl) return new NextResponse(null, { status: 204 });

  return NextResponse.json({ url: signed.signedUrl, marks: asset.marks ?? null });
}
