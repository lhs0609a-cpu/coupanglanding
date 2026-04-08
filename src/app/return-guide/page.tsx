'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, ChevronLeft, ChevronRight, PartyPopper, RotateCcw } from 'lucide-react';

interface AddressInfo {
  name: string;
  phone: string;
  address: string;
}

interface GuideStep {
  title: string;
  description: string;
  copies?: { label: string; value: string }[];
  hint: string;
}

const SESSION_KEY = 'megaload_return_guide';

function buildCjSteps(sender: AddressInfo, dest: AddressInfo): GuideStep[] {
  return [
    {
      title: '로그인 / 비회원 접수',
      description: 'CJ대한통운 사이트에서 "반품예약" 페이지가 열렸습니다. 로그인하거나 비회원 접수를 선택하세요.',
      hint: '상단 "반품예약 접수" 화면이 보이면 준비 완료입니다.',
    },
    {
      title: '보내는 분 이름 입력',
      description: '"보내는 분" 란에 아래 구매자 이름을 붙여넣으세요.',
      copies: [{ label: '보내는 분 이름', value: sender.name }],
      hint: '"보내는 분 정보" 섹션의 이름 입력란에 붙여넣기(Ctrl+V) 하세요.',
    },
    {
      title: '보내는 분 연락처 입력',
      description: '연락처를 붙여넣으세요.',
      copies: [{ label: '연락처', value: sender.phone }],
      hint: '전화번호 입력란에 붙여넣으세요. 하이픈(-) 포함 그대로 넣으면 됩니다.',
    },
    {
      title: '보내는 분 주소 입력',
      description: '주소 검색 창에 아래 주소를 참고하여 입력하세요.',
      copies: [{ label: '주소', value: sender.address }],
      hint: '주소 검색 버튼 클릭 → 동/읍/면 이름으로 검색 → 선택 후 상세주소 입력.',
    },
    {
      title: '받는 분 정보 입력',
      description: '"받는 분" 란에 도착지 정보를 하나씩 붙여넣으세요.',
      copies: [
        { label: '받는 분 이름', value: dest.name },
        { label: '받는 분 연락처', value: dest.phone },
        { label: '받는 분 주소', value: dest.address },
      ],
      hint: '이름 → 연락처 → 주소 순서로 각 칸에 붙여넣으세요.',
    },
    {
      title: '접수 완료!',
      description: '물품 정보와 수량을 확인한 후 "예약접수" 버튼을 누르세요.',
      hint: '접수가 완료되면 택배기사가 구매자에게 방문하여 수거합니다. 보통 1~2 영업일 소요.',
    },
  ];
}

function buildEpostSteps(sender: AddressInfo, dest: AddressInfo): GuideStep[] {
  return [
    {
      title: '우체국 택배 예약 진입',
      description: '우체국 택배 사이트가 열렸습니다. "택배 예약" 또는 "방문접수" 메뉴를 찾아 클릭하세요.',
      hint: '메인 화면에서 "택배 예약" 배너 또는 상단 메뉴를 클릭하세요.',
    },
    {
      title: '보내는 분 이름 입력',
      description: '"보내는 사람" 란에 아래 구매자 이름을 붙여넣으세요.',
      copies: [{ label: '보내는 분 이름', value: sender.name }],
      hint: '"보내는 사람 정보" 입력란을 찾아 이름을 입력하세요.',
    },
    {
      title: '보내는 분 연락처 입력',
      description: '연락처를 붙여넣으세요.',
      copies: [{ label: '연락처', value: sender.phone }],
      hint: '전화번호 입력란에 하이픈(-) 포함하여 입력하세요.',
    },
    {
      title: '보내는 분 주소 입력',
      description: '주소 검색 후 아래 주소를 참고하여 입력하세요.',
      copies: [{ label: '주소', value: sender.address }],
      hint: '우편번호 검색 버튼 → 주소 선택 → 상세주소 입력 순서로 진행하세요.',
    },
    {
      title: '받는 분 정보 입력',
      description: '"받는 사람" 란에 도착지 정보를 하나씩 붙여넣으세요.',
      copies: [
        { label: '받는 분 이름', value: dest.name },
        { label: '받는 분 연락처', value: dest.phone },
        { label: '받는 분 주소', value: dest.address },
      ],
      hint: '이름 → 연락처 → 주소 순서로 각 칸에 붙여넣으세요.',
    },
    {
      title: '접수 완료!',
      description: '물품 정보를 확인하고 "접수" 버튼을 누르세요.',
      hint: '접수가 완료되면 우체국 택배기사가 구매자에게 방문하여 수거합니다. 보통 1~2 영업일 소요.',
    },
  ];
}

function CopyCard({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-900 font-mono break-all mt-0.5 leading-snug">{value}</p>
      </div>
      <button
        onClick={handleCopy}
        className={`shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold transition ${
          copied
            ? 'bg-green-500 text-white'
            : 'bg-[#E31837] text-white hover:bg-red-700 active:scale-95'
        }`}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? '완료!' : '복사'}
      </button>
    </div>
  );
}

export default function ReturnGuidePage() {
  const [data, setData] = useState<{
    courier: 'cj' | 'epost';
    sender: AddressInfo;
    destination: AddressInfo;
  } | null>(null);

  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) setData(JSON.parse(raw));
    } catch { /* empty */ }
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center space-y-2">
          <RotateCcw className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="text-sm text-gray-500">가이드 데이터를 찾을 수 없습니다.</p>
          <p className="text-xs text-gray-400">반품수거 페이지에서 &quot;접수 시작&quot;을 눌러주세요.</p>
        </div>
      </div>
    );
  }

  const steps = data.courier === 'cj'
    ? buildCjSteps(data.sender, data.destination)
    : buildEpostSteps(data.sender, data.destination);

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;
  const courierName = data.courier === 'cj' ? 'CJ대한통운' : '우체국택배';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-[#E31837]" />
          <div>
            <h1 className="text-sm font-bold text-gray-900">{courierName} 수거 접수 가이드</h1>
            <p className="text-[11px] text-gray-500">
              이 창을 택배사 사이트 옆에 두고 따라하세요
            </p>
          </div>
        </div>
        {/* progress */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#E31837] rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[11px] text-gray-500 font-medium shrink-0">
            {currentStep + 1} / {steps.length}
          </span>
        </div>
      </div>

      {/* content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLast && !step.copies ? (
          /* 완료 화면 */
          <div className="text-center py-8 space-y-3">
            <PartyPopper className="w-14 h-14 text-[#E31837] mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">수거 접수 완료!</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              택배기사가 구매자 주소로 방문하여<br />
              상품을 수거합니다.<br />
              보통 <strong>1~2 영업일</strong> 내 수거 완료.
            </p>
            <p className="text-xs text-gray-400 mt-4">이 창을 닫아도 됩니다.</p>
          </div>
        ) : (
          <>
            {/* step indicator + title */}
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-8 h-8 rounded-full bg-[#E31837] text-white flex items-center justify-center text-sm font-bold shadow-sm">
                {currentStep + 1}
              </span>
              <div className="pt-0.5">
                <h2 className="font-bold text-gray-900 text-[15px]">{step.title}</h2>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{step.description}</p>
              </div>
            </div>

            {/* copy cards */}
            {step.copies && step.copies.length > 0 && (
              <div className="space-y-2">
                {step.copies.map((c, i) => (
                  <CopyCard key={i} label={c.label} value={c.value} />
                ))}
              </div>
            )}

            {/* hint */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
              <p className="text-xs text-blue-800 leading-relaxed">
                <strong>Tip:</strong> {step.hint}
              </p>
            </div>
          </>
        )}
      </div>

      {/* navigation */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
          disabled={currentStep === 0}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          이전
        </button>

        {isLast ? (
          <button
            onClick={() => window.close()}
            className="px-5 py-2 text-sm font-bold text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition"
          >
            닫기
          </button>
        ) : (
          <button
            onClick={() => setCurrentStep(s => Math.min(steps.length - 1, s + 1))}
            className="flex items-center gap-1 px-4 py-2 text-sm font-bold text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition active:scale-95"
          >
            다음
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
