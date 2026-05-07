import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { SCREENING_QUESTIONS, FREE_TEXT_QUESTION } from '@/lib/data/screening-questions';
import { calculateScreeningScore } from '@/lib/utils/screening-scorer';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


// GET: 토큰 검증 → 질문 반환 (공개 API, 인증 불요)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 });
    }

    const supabase = await createServiceClient();

    const { data: link } = await supabase
      .from('screening_links')
      .select('id, candidate_name, status, expires_at, completed_at')
      .eq('token', token)
      .single();

    if (!link) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 404 });
    }

    // 만료 확인
    if (new Date(link.expires_at) < new Date()) {
      // 상태가 아직 pending이면 expired로 업데이트
      if (link.status === 'pending') {
        await supabase
          .from('screening_links')
          .update({ status: 'expired' })
          .eq('id', link.id);
      }
      return NextResponse.json({ error: '링크가 만료되었습니다.' }, { status: 410 });
    }

    // 이미 완료
    if (link.status === 'completed') {
      return NextResponse.json({ error: '이미 응시가 완료되었습니다.' }, { status: 409 });
    }

    if (link.status === 'expired') {
      return NextResponse.json({ error: '링크가 만료되었습니다.' }, { status: 410 });
    }

    // 질문 반환 (점수/플래그 정보 제거)
    const questions = SCREENING_QUESTIONS.map((q) => ({
      id: q.id,
      category: q.category,
      title: q.title,
      scenario: q.scenario,
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
      })),
    }));

    return NextResponse.json({
      candidateName: link.candidate_name,
      questions,
      freeTextQuestion: {
        id: FREE_TEXT_QUESTION.id,
        title: FREE_TEXT_QUESTION.title,
        question: FREE_TEXT_QUESTION.question,
        placeholder: FREE_TEXT_QUESTION.placeholder,
        minLength: FREE_TEXT_QUESTION.minLength,
      },
    });
  } catch (err) {
    console.error('screening GET error:', err);
    void logSystemError({ source: 'screening/[token]', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 답변 제출 → 서버 채점 → 결과 저장 (공개 API)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 });
    }

    const body = await request.json();
    const { answers, freeTextAnswer, timeSpentSeconds } = body;

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: '답변 데이터가 필요합니다.' }, { status: 400 });
    }

    if (typeof timeSpentSeconds !== 'number' || timeSpentSeconds < 0) {
      return NextResponse.json({ error: '응시 시간이 필요합니다.' }, { status: 400 });
    }

    const supabase = await createServiceClient();

    // 토큰 검증
    const { data: link } = await supabase
      .from('screening_links')
      .select('id, status, expires_at')
      .eq('token', token)
      .single();

    if (!link) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 404 });
    }

    if (link.status === 'completed') {
      return NextResponse.json({ error: '이미 응시가 완료되었습니다.' }, { status: 409 });
    }

    if (link.status === 'expired' || new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: '링크가 만료되었습니다.' }, { status: 410 });
    }

    // 서버 채점
    const result = calculateScreeningScore(answers, timeSpentSeconds);

    // IP 추출
    const forwarded = request.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : 'unknown';

    // 시간 플래그가 있으면 red_flags에 추가
    const allRedFlags = [...result.redFlags];
    if (result.timeFlag) {
      allRedFlags.push(result.timeFlag);
    }

    // 결과 저장
    const { error: insertError } = await supabase
      .from('screening_results')
      .insert({
        link_id: link.id,
        answers,
        total_score: result.totalScore,
        grade: result.grade,
        category_scores: result.categoryScores,
        red_flags: allRedFlags,
        yellow_flags: result.yellowFlags,
        green_flags: result.greenFlags,
        consistency_warnings: result.consistencyWarnings,
        knockout_reasons: result.knockoutReasons,
        time_spent_seconds: timeSpentSeconds,
        respondent_ip: clientIp,
        free_text_answer: freeTextAnswer || null,
      });

    if (insertError) {
      console.error('screening result insert error:', insertError);
      void logSystemError({ source: 'screening/[token]', error: insertError }).catch(() => {});
      return NextResponse.json({ error: '결과 저장에 실패했습니다.' }, { status: 500 });
    }

    // 링크 상태 완료 처리
    await supabase
      .from('screening_links')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', link.id);

    return NextResponse.json({ success: true, grade: result.grade });
  } catch (err) {
    console.error('screening POST error:', err);
    void logSystemError({ source: 'screening/[token]', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
