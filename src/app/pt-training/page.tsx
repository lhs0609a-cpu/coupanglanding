import type { Metadata } from 'next';
import TrainingSignup from '@/components/training/TrainingSignup';
import { KAKAO_SUPPORT_URL } from '@/lib/support-link';

export const metadata: Metadata = {
  title: '쿠팡 PT 교육 일정 신청 | 입점 완료자',
  description: '쿠팡윙 입점을 마친 분들을 위한 PT 교육 신청. 가능한 날짜와 시간을 선택해 교육을 예약하세요.',
  alternates: { canonical: '/pt-training' },
  openGraph: { title: '쿠팡 PT 교육, 언제 받으실까요?', description: '입점을 마쳤다면 교육 날짜와 시간을 선택해 신청하세요.', url: 'https://www.megaload.co.kr/pt-training' },
};
export default function TrainingPage() {
  return <main id="main-content" className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-bold text-rose-600">쿠팡윙 입점 완료자 대상</p>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight">PT 교육,<br />언제 받으실까요?</h1>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong className="block">쿠팡윙 입점 승인을 완료한 분만 신청 가능합니다.</strong>사업자등록과 쿠팡윙 입점은 준비 가이드를 보고 직접 완료해 주세요. 아래 신청은 입점 후 진행하는 PT 교육 예약입니다.<a href="/pt-ready" className="mt-2 block font-bold underline">아직 입점 전이라면 준비 가이드 보기 →</a></div>
      <p className="mt-4 leading-7 text-slate-600">실제 상품 대량등록과 판매 운영을 배우는 PT 교육입니다. 참여 가능한 날짜와 시간을 골라 신청해 주세요.</p>
      <TrainingSignup />
      <a href={KAKAO_SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="mt-6 block rounded-xl bg-yellow-300 p-4 text-center font-bold">일정 문의·신청 변경은 카톡으로</a>
    </div>
  </main>;
}
