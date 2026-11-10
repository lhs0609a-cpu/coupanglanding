import type { Metadata } from 'next';
import { ACT1_STEPS } from '@/lib/data/academy/act1-open';
import { KAKAO_SUPPORT_URL } from '@/lib/support-link';

export const metadata: Metadata = {
  title: '쿠팡 PT 시작 준비 | 사업자등록부터 윙 입점까지',
  description: '토스페이먼츠에서 사업자등록·통신판매업 신고를 한 번에 신청하고, 쿠팡윙 입점 승인 후 카톡으로 알려주세요.',
  alternates: { canonical: '/pt-ready' },
  openGraph: {
    title: '쿠팡 PT, 윙 입점까지 준비해 주세요',
    description: '토스에서 사업자등록·통신판매업 신고 한 번에 → 쿠팡윙 입점 승인 → 카톡으로 교육 시작 안내.',
    url: 'https://www.megaload.co.kr/pt-ready',
  },
};

const wing = ACT1_STEPS.find(s => s.key === 'act1-04-wing-signup')!;
const TOSS_URL = 'https://onboarding.tosspayments.com/business-registration/intro';
const tossSteps: NonNullable<typeof wing.howto> = [
  { id: 'toss-start', label: '토스에서 “바로 시작하기”를 누르세요', description: '아래 토스 신청 버튼을 열고 “바로 시작하기”를 선택하세요. 사업자등록과 통신판매업 신고를 한 번에 신청하는 서비스입니다.' },
  { id: 'toss-info', label: '본인 인증 후 사업 정보를 입력하세요', description: '화면 안내에 따라 본인 인증을 하고 상호, 사업장 주소, 판매할 업종 등 필요한 정보를 입력하세요. 실제 사업 상황에 맞게 선택하고, 추가로 요청하는 정보가 있으면 안내대로 제출해 주세요.' },
  { id: 'toss-submit', label: '사업자등록과 통신판매업 신고를 함께 진행하세요', description: '토스의 신청 흐름을 따라 두 절차를 진행하세요. 신청 후에는 토스에서 보내는 진행 안내와 보완 요청을 확인해 주세요.' },
  { id: 'toss-done', label: '사업자등록증과 통신판매업 신고증을 준비하세요', description: '접수만 하고 끝내지 말고 처리 완료까지 확인해 주세요. 발급된 서류와 번호는 다음 단계인 쿠팡윙 사업자 인증에 사용합니다.', tip: '토스 신청 대행 수수료와 별개로 통신판매업 등록면허세 등이 발생할 수 있습니다. 안내받은 고지 금액과 납부 기한을 확인하세요.' },
];
const sections = [
  { id: 'toss', title: '토스에서 한 번에 신청하기', summary: '사업자등록 + 통신판매업 신고를 토스페이먼츠 대행으로 함께 진행하세요.', steps: tossSteps, url: TOSS_URL, button: '토스로 사업자등록·통신판매업 신청', done: '사업자등록증·통신판매업 신고증 준비 완료' },
  { id: 'wing-approval', title: '쿠팡윙 가입하고 입점 승인받기', summary: '서류가 준비되면 쿠팡윙에서 판매자 계정을 만들고 사업자 인증을 진행하세요. 사업자등록증·통신판매업 신고증·정산 계좌 자료 등 화면에서 요구하는 서류를 제출한 뒤, 승인 상태를 확인하세요.', steps: wing.howto!.filter(s => ['cw-3', 'cw-4', 'cw-5'].includes(s.id)), url: 'https://wing.coupang.com', button: '쿠팡윙 가입·입점 진행하기', done: '사업자 인증 승인·정산 계좌 등록 완료' },
];

export default function PtReadyPage() {
  return (
    <main id="main-content" className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <span className="font-bold">쿠팡 PT</span>
          <a href={KAKAO_SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="rounded-full bg-yellow-300 px-4 py-2 text-sm font-bold">카톡 문의</a>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
        <p className="mb-3 text-sm font-bold text-rose-600">교육 시작 전 준비 안내</p>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">쿠팡윙 입점까지<br />준비해 주세요.</h1>
        <p className="mt-5 leading-7 text-slate-600"><strong className="text-slate-900">토스에서 사업자등록·통신판매업 신고를 한 번에 신청</strong>하고, 서류가 준비되면 쿠팡윙 입점을 진행하세요. 입점 승인 후 원하는 PT 교육 날짜를 선택해 신청하시면 됩니다.</p>
        <p className="mt-3 text-sm leading-6 text-slate-500">이미 완료한 단계는 넘어가세요. 신청 접수와 최종 승인은 다릅니다. 처리 중에는 해당 사이트에서 보완 요청과 승인 여부를 확인해 주세요.</p>
        <nav aria-label="준비 순서" className="my-7 grid grid-cols-2 gap-2">
          {sections.map((section, i) => <a key={section.id} href={`#${section.id}`} className="rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold">{i + 1}. {section.title}</a>)}
        </nav>
        <div className="space-y-5">
          {sections.map((section, i) => (
            <section key={section.id} id={section.id} className="scroll-mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
              <p className="text-sm font-bold text-rose-600">STEP {i + 1}</p>
              <h2 className="mt-2 text-xl font-bold">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{section.summary}</p>
              <a href={section.url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">{section.button} ↗</a>
              <details className="mt-5" open={i === 0}>
                <summary className="cursor-pointer py-2 text-sm font-bold text-slate-700">자세한 신청 방법 보기</summary>
                <ol className="mt-3 space-y-5">
                  {section.steps.map((step, index) => (
                    <li key={step.id} className="border-l-2 border-rose-100 pl-4">
                      <h3 className="font-semibold leading-6">{index + 1}. {step.label}</h3>
                      {step.description && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{step.description}</p>}
                      {step.workspace && <p className="mt-2 text-sm leading-6 text-slate-500">이동 경로: {step.workspace.path}</p>}
                      {step.tip && <p className="mt-2 text-sm leading-6 text-slate-500">{step.tip}</p>}
                      {step.warning && step.id !== 'cw-5' && <p className="mt-2 text-sm leading-6 text-amber-800">{step.warning}</p>}
                      {step.link && <a href={step.link.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block py-2 text-sm font-semibold text-blue-700 underline">{step.link.label} ↗</a>}
                    </li>
                  ))}
                </ol>
              </details>
              <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm font-medium leading-6 text-emerald-800">완료 기준: {section.done}</p>
            </section>
          ))}
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-500">이미 사업자등록을 마쳤거나 토스 신청 중 진행이 어려운 경우, 현재 준비 상태를 카톡으로 알려주세요. 상황에 맞춰 안내드리겠습니다.</p>
        <section className="mt-8 rounded-2xl bg-slate-900 p-6 text-white sm:p-8">
          <h2 className="text-2xl font-bold">입점 승인까지 끝났나요?</h2>
          <p className="mt-3 leading-7 text-slate-300">이제 <strong className="text-white">PT 교육을 받을 날짜와 시간</strong>을 선택해 신청해 주세요.</p>
          <p className="mt-3 text-sm leading-6 text-slate-300">입점을 마친 분들과 함께 실제 상품 대량등록과 판매 운영 교육을 진행합니다.</p>
          <a href="/pt-training" className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-yellow-300 px-4 py-4 font-bold text-slate-900">PT 교육 날짜 선택하고 신청하기 →</a>
          <p className="mt-3 text-center text-sm text-slate-400">준비 중 막히는 부분도 같은 카톡으로 문의해 주세요.</p>
        </section>
        <footer className="mt-8 text-sm leading-6 text-slate-500">
          <p>신청 화면에서 요구하는 최신 서류와 처리 안내를 확인해 주세요.</p>
          <a href="https://marketplace.coupang.com/register?rf=MARKETPLACE" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline">쿠팡 공식 입점 준비 안내 ↗</a>
        </footer>
      </div>
    </main>
  );
}
