import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { AD_ACADEMY_STAGES } from '@/lib/data/ad-academy-stages';
import { grantAdAcademyRewards } from '@/lib/utils/ad-academy-rewards';

export const maxDuration = 30;


export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!ptUser) return NextResponse.json({ error: 'PT user not found' }, { status: 404 });

    const body = await req.json();
    const { stageId, answers, bonusTipsFound } = body as {
      stageId: string;
      answers: Record<string, string>;
      bonusTipsFound: string[];
    };

    // Find stage
    const stage = AD_ACADEMY_STAGES.find(s => s.id === stageId);
    if (!stage) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });

    // Validate answers server-side
    const quiz = stage.checkpointQuiz;
    let correctCount = 0;
    const results: { questionId: string; correct: boolean; correctAnswer: string }[] = [];

    for (const q of quiz) {
      const userAnswer = answers[q.id];
      const isCorrect = userAnswer === q.correctAnswer;
      if (isCorrect) correctCount++;
      results.push({ questionId: q.id, correct: isCorrect, correctAnswer: q.correctAnswer });
    }

    const quizScore = Math.round((correctCount / quiz.length) * 100);

    // Calculate stars
    let stars = 0;
    if (quizScore >= stage.starThresholds.three) stars = 3;
    else if (quizScore >= stage.starThresholds.two) stars = 2;
    else if (quizScore >= stage.starThresholds.one) stars = 1;

    // Minimum pass: at least 1 star
    const passed = stars >= 1;

    if (!passed) {
      return NextResponse.json({ passed: false, stars: 0, quizScore, results, rewards: null });
    }

    // Grant rewards
    const serviceClient = await createServiceClient();
    const rewards = await grantAdAcademyRewards(
      serviceClient,
      ptUser.id,
      stageId,
      stars,
      (bonusTipsFound || []).length
    );

    return NextResponse.json({
      passed: true,
      stars,
      quizScore,
      results,
      rewards,
    });
  } catch (err) {
    console.error('ad-academy complete error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    );
  }
}
