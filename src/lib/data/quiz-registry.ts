export interface QuizQuestion {
  id: number;
  type: 'ox' | 'multiple_choice';
  question: string;
  explanation: string;
  correctAnswer: string;
  options?: { key: string; label: string }[];
}

import { QUIZ_QUESTIONS } from './legal-education-quiz';
import { MARGIN_QUIZ_QUESTIONS } from './margin-education-quiz';
import { PENALTY_QUIZ_QUESTIONS } from './penalty-prevention-quiz';
import { CS_RETURNS_QUIZ_QUESTIONS } from './cs-returns-quiz';
import { ESSENTIAL_TIPS_QUIZ_QUESTIONS } from './essential-tips-quiz';

const quizMap: Record<string, QuizQuestion[]> = {
  legal_education: QUIZ_QUESTIONS,
  margin_education: MARGIN_QUIZ_QUESTIONS,
  penalty_prevention: PENALTY_QUIZ_QUESTIONS,
  cs_returns_education: CS_RETURNS_QUIZ_QUESTIONS,
  essential_tips: ESSENTIAL_TIPS_QUIZ_QUESTIONS,
};

export function getQuizQuestions(stepKey: string): QuizQuestion[] {
  return quizMap[stepKey] ?? [];
}
