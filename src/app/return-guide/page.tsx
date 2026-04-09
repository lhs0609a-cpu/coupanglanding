'use client';

import { useState, useEffect } from 'react';
import {
  Copy, Check, ChevronLeft, ChevronRight, RotateCcw, ExternalLink,
  LogIn, User, Phone, Home, UserCheck, Smartphone, MapPin, Package,
  CheckCircle2, PlayCircle, Search, ClipboardList, Truck, Loader2, AlertCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface AddressInfo {
  name: string;
  phone: string;
  address: string;
}

interface GuideStep {
  icon: LucideIcon;
  title: string;
  description: string;
  copies?: { label: string; value: string }[];
  hint?: string;
}

const SESSION_KEY = 'megaload_return_guide';

function buildCjSteps(sender: AddressInfo, dest: AddressInfo): GuideStep[] {
  return [
    {
      icon: PlayCircle,
      title: '준비하기',
      description: 'CJ대한통운 반품예약 사이트가 옆에 열렸는지 확인해주세요. 열리지 않았다면 위쪽의 빨간 버튼을 눌러 사이트를 여세요.',
      hint: '사이트와 이 가이드 창을 나란히 배치하면 따라하기 편합니다.',
    },
    {
      icon: LogIn,
      title: '로그인 또는 비회원 접수',
      description: 'CJ 사이트에서 로그인을 하거나, 아이디가 없으면 "비회원 접수" 버튼을 선택하세요.',
      hint: '처음 이용한다면 비회원 접수가 간편합니다.',
    },
    {
      icon: User,
      title: '보내는 분 이름 입력',
      description: '"보내는 분" 이름 칸을 클릭하고, 아래 복사 버튼을 누른 뒤 입력란에 Ctrl+V로 붙여넣으세요.',
      copies: [{ label: '보내는 분 이름', value: sender.name }],
      hint: '입력란 안에 커서를 둔 상태에서 붙여넣기하세요.',
    },
    {
      icon: Phone,
      title: '보내는 분 연락처 입력',
      description: '"보내는 분 연락처" 칸을 클릭한 다음, 아래 번호를 복사해서 붙여넣으세요.',
      copies: [{ label: '연락처', value: sender.phone }],
      hint: '하이픈(-) 포함 그대로 붙여넣어도 됩니다.',
    },
    {
      icon: Home,
      title: '보내는 분 주소 입력',
      description: '"주소 검색" 버튼을 눌러 검색창을 연 뒤, 아래 주소를 복사해서 검색하세요. 주소 선택 후 상세주소가 자동으로 채워집니다.',
      copies: [{ label: '주소', value: sender.address }],
      hint: '동/읍/면 이름으로 검색하면 더 잘 찾아집니다.',
    },
    {
      icon: UserCheck,
      title: '받는 분 이름 입력',
      description: '이제 "받는 분" 차례입니다. "받는 분 이름" 칸을 클릭한 다음 아래 이름을 붙여넣으세요.',
      copies: [{ label: '받는 분 이름', value: dest.name }],
      hint: '보내는 분 정보 바로 아래 섹션에 있습니다.',
    },
    {
      icon: Smartphone,
      title: '받는 분 연락처 입력',
      description: '"받는 분 연락처" 칸에 아래 번호를 복사해서 붙여넣으세요.',
      copies: [{ label: '연락처', value: dest.phone }],
      hint: '절반 이상 진행되었습니다. 조금만 더 힘내세요.',
    },
    {
      icon: MapPin,
      title: '받는 분 주소 입력',
      description: '"받는 분 주소 검색" 버튼을 눌러 검색창을 연 뒤, 아래 주소로 검색하세요.',
      copies: [{ label: '주소', value: dest.address }],
      hint: '주소 선택 후 상세주소가 비어 있다면 직접 입력해주세요.',
    },
    {
      icon: Package,
      title: '물품 정보 선택',
      description: '물품 종류를 선택합니다. "의류", "잡화", "기타" 중 적합한 항목을 선택하세요.',
      hint: '수량은 특별한 경우가 아니면 1개로 두시면 됩니다.',
    },
    {
      icon: CheckCircle2,
      title: '예약 접수 완료',
      description: '화면 아래쪽의 "예약접수" 또는 "접수완료" 버튼을 눌러 최종 제출하세요.',
      hint: '이 버튼을 누르면 접수가 완료됩니다.',
    },
    {
      icon: CheckCircle2,
      title: '접수가 완료되었습니다',
      description: '',
    },
  ];
}

function buildEpostSteps(sender: AddressInfo, dest: AddressInfo): GuideStep[] {
  return [
    {
      icon: PlayCircle,
      title: '준비하기',
      description: '우체국택배 사이트가 옆에 열렸는지 확인해주세요. 열리지 않았다면 위쪽의 빨간 버튼을 눌러 사이트를 여세요.',
      hint: '사이트와 이 가이드 창을 나란히 배치하면 따라하기 편합니다.',
    },
    {
      icon: ClipboardList,
      title: '방문접수 메뉴 진입',
      description: '우체국 사이트에서 "방문접수" 또는 "택배 예약" 메뉴를 찾아 클릭하세요.',
      hint: '메인 페이지 상단이나 배너에서 찾을 수 있습니다.',
    },
    {
      icon: LogIn,
      title: '로그인 또는 비회원 예약',
      description: '로그인을 하거나 "비회원 예약"을 선택하세요.',
      hint: '처음이라면 비회원 예약이 간편합니다.',
    },
    {
      icon: User,
      title: '보내는 분 이름 입력',
      description: '"보내는 사람" 이름 칸을 클릭하고, 아래 복사 버튼을 누른 뒤 Ctrl+V로 붙여넣으세요.',
      copies: [{ label: '보내는 분 이름', value: sender.name }],
      hint: '입력란 안에 커서를 둔 상태에서 붙여넣기하세요.',
    },
    {
      icon: Phone,
      title: '보내는 분 연락처 입력',
      description: '"보내는 사람 연락처" 칸에 아래 번호를 복사해서 붙여넣으세요.',
      copies: [{ label: '연락처', value: sender.phone }],
      hint: '하이픈(-) 포함 그대로 붙여넣어도 됩니다.',
    },
    {
      icon: Search,
      title: '보내는 분 주소 입력',
      description: '"우편번호 검색" 버튼을 눌러 팝업을 연 뒤, 아래 주소로 검색하세요. 주소 선택 후 상세주소가 자동으로 채워집니다.',
      copies: [{ label: '주소', value: sender.address }],
      hint: '동/읍/면 이름으로 검색하면 더 잘 찾아집니다.',
    },
    {
      icon: UserCheck,
      title: '받는 분 이름 입력',
      description: '이제 "받는 사람" 차례입니다. "받는 사람 이름" 칸에 아래 이름을 붙여넣으세요.',
      copies: [{ label: '받는 분 이름', value: dest.name }],
      hint: '보내는 사람 정보 아래에 있습니다.',
    },
    {
      icon: Smartphone,
      title: '받는 분 연락처 입력',
      description: '"받는 사람 연락처" 칸에 아래 번호를 붙여넣으세요.',
      copies: [{ label: '연락처', value: dest.phone }],
      hint: '거의 다 왔습니다.',
    },
    {
      icon: MapPin,
      title: '받는 분 주소 입력',
      description: '"받는 사람 우편번호 검색"을 눌러 팝업을 연 뒤 아래 주소로 검색하세요.',
      copies: [{ label: '주소', value: dest.address }],
      hint: '주소 선택 후 상세주소를 확인해주세요.',
    },
    {
      icon: Package,
      title: '물품 정보 선택',
      description: '물품 종류를 선택합니다. "의류" 또는 "잡화"가 일반적입니다.',
      hint: '수량은 특별한 경우가 아니면 1개로 두시면 됩니다.',
    },
    {
      icon: CheckCircle2,
      title: '접수 완료',
      description: '화면 아래쪽의 "접수" 또는 "신청" 버튼을 눌러 최종 제출하세요.',
      hint: '이 버튼을 누르면 접수가 완료됩니다.',
    },
    {
      icon: CheckCircle2,
      title: '접수가 완료되었습니다',
      description: '',
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
        className={`shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold transition active:scale-95 ${
          copied
            ? 'bg-green-500 text-white'
            : 'bg-[#E31837] text-white hover:bg-red-700'
        }`}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}

export default function ReturnGuidePage() {
  const [data, setData] = useState<{
    courier: 'cj' | 'epost';
    sender: AddressInfo;
    destination: AddressInfo;
    courierUrl?: string;
    receiptId?: number | null;
  } | null>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [courierOpened, setCourierOpened] = useState(false);

  // 회수 송장 등록 상태
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceRegistered, setInvoiceRegistered] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) setData(JSON.parse(raw));
    } catch { /* empty */ }
  }, []);

  // 가이드 팝업이 뜨자마자 택배사 사이트 자동 오픈 시도 (차단되면 버튼으로 폴백)
  useEffect(() => {
    if (!data?.courierUrl || courierOpened) return;
    try {
      const win = window.open(data.courierUrl, 'courierSite');
      if (win && !win.closed) setCourierOpened(true);
    } catch { /* popup blocked — user will click button */ }
  }, [data, courierOpened]);

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

  const baseSteps = data.courier === 'cj'
    ? buildCjSteps(data.sender, data.destination)
    : buildEpostSteps(data.sender, data.destination);

  // receiptId가 있을 때는 마지막에 "회수 운송장 등록" 단계 추가
  const hasInvoiceStep = !!data.receiptId;
  const steps: (GuideStep & { isInvoiceStep?: boolean })[] = hasInvoiceStep
    ? [
        ...baseSteps,
        {
          icon: Truck,
          title: '회수 운송장 쿠팡에 등록',
          description: '택배사 접수 후 받은 운송장 번호를 아래에 입력하고 버튼을 눌러 쿠팡에 등록하세요.',
          isInvoiceStep: true,
        },
      ]
    : baseSteps;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const isInvoiceStep = !!step.isInvoiceStep;
  const isCompletionScreen = step.title === '접수가 완료되었습니다';
  const progress = ((currentStep + 1) / steps.length) * 100;
  const courierName = data.courier === 'cj' ? 'CJ대한통운' : '우체국택배';
  const courierCode = data.courier === 'cj' ? 'CJGLS' : 'EPOST';
  const StepIcon = step.icon;

  const handleRegisterInvoice = async () => {
    if (!data.receiptId) return;
    if (!invoiceNumber.trim()) {
      setInvoiceError('운송장 번호를 입력해주세요.');
      return;
    }
    setInvoiceSubmitting(true);
    setInvoiceError(null);
    try {
      const res = await fetch('/api/megaload/returns/register-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId: data.receiptId,
          deliveryCompanyCode: courierCode,
          invoiceNumber: invoiceNumber.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '등록 실패');
      setInvoiceRegistered(true);
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  const handleOpenCourier = () => {
    if (!data.courierUrl) return;
    const win = window.open(data.courierUrl, 'courierSite');
    if (win && !win.closed) {
      setCourierOpened(true);
      win.focus();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-[#E31837] shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-gray-900 truncate">{courierName} 수거 접수 가이드</h1>
            <p className="text-[11px] text-gray-500 truncate">
              이 창을 택배사 사이트 옆에 두고 따라하세요
            </p>
          </div>
        </div>

        {/* 택배사 사이트 열기 버튼 */}
        {data.courierUrl && (
          <button
            onClick={handleOpenCourier}
            className={`mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-white text-xs font-bold transition ${
              courierOpened
                ? 'bg-gray-400 hover:bg-gray-500'
                : 'bg-[#E31837] hover:bg-red-700 animate-pulse'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {courierOpened ? `${courierName} 사이트 다시 열기` : `${courierName} 사이트 열기`}
          </button>
        )}

        {/* progress */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#E31837] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[11px] text-gray-600 font-semibold shrink-0">
            {currentStep + 1} / {steps.length}
          </span>
        </div>
      </div>

      {/* content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isInvoiceStep ? (
          /* 회수 운송장 등록 단계 */
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center pt-2">
              <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-3">
                <Truck className="w-9 h-9 text-[#E31837]" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-[#E31837] text-white flex items-center justify-center text-[10px] font-bold">
                  {currentStep + 1}
                </span>
                <span className="text-xs text-gray-500 font-medium">마지막 단계</span>
              </div>
            </div>

            <div className="text-center px-1">
              <h2 className="font-bold text-gray-900 text-lg mb-2">{step.title}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
            </div>

            {invoiceRegistered ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                <p className="text-sm font-bold text-green-800">쿠팡에 등록 완료!</p>
                <p className="text-xs text-green-700">
                  회수 운송장이 쿠팡에 등록되었습니다.<br />
                  쿠팡 WING에서 확인할 수 있습니다.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">접수번호</span>
                    <span className="font-mono font-semibold text-gray-800">#{data.receiptId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">택배사</span>
                    <span className="font-semibold text-gray-800">{courierName}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    운송장 번호
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    placeholder="예: 1234567890"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent font-mono"
                    disabled={invoiceSubmitting}
                  />
                </div>
                {invoiceError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{invoiceError}</span>
                  </div>
                )}
                <button
                  onClick={handleRegisterInvoice}
                  disabled={invoiceSubmitting || !invoiceNumber.trim()}
                  className="w-full flex items-center justify-center gap-1.5 py-3 rounded-lg bg-[#E31837] text-white text-sm font-bold hover:bg-red-700 transition disabled:opacity-50"
                >
                  {invoiceSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      등록 중...
                    </>
                  ) : (
                    <>
                      <Truck className="w-4 h-4" />
                      쿠팡에 등록하기
                    </>
                  )}
                </button>
                <p className="text-[11px] text-gray-400 text-center">
                  나중에 등록해도 됩니다. 건너뛰려면 &quot;창 닫기&quot;를 누르세요.
                </p>
              </div>
            )}
          </div>
        ) : isCompletionScreen ? (
          /* 완료 화면 */
          <div className="flex flex-col items-center justify-center text-center h-full py-8 space-y-4">
            <div className="w-20 h-20 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">접수가 완료되었습니다</h2>
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 max-w-xs">
              <p className="text-sm text-gray-700 leading-relaxed">
                수고하셨습니다.<br />
                <strong className="text-[#E31837]">1~2 영업일</strong> 안에 택배 기사가 구매자 주소로 방문하여 상품을 수거합니다.
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-2">이 창은 닫으셔도 됩니다.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* 아이콘 + 단계 번호 */}
            <div className="flex flex-col items-center text-center pt-2">
              <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-3">
                <StepIcon className="w-9 h-9 text-[#E31837]" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-[#E31837] text-white flex items-center justify-center text-[10px] font-bold">
                  {currentStep + 1}
                </span>
                <span className="text-xs text-gray-500 font-medium">
                  / {baseSteps.length - 1} 단계
                </span>
              </div>
            </div>

            {/* 제목 + 설명 */}
            <div className="text-center px-1">
              <h2 className="font-bold text-gray-900 text-lg mb-2">{step.title}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                {step.description}
              </p>
            </div>

            {/* 복사 카드 */}
            {step.copies && step.copies.length > 0 && (
              <div className="space-y-2">
                {step.copies.map((c, i) => (
                  <CopyCard key={i} label={c.label} value={c.value} />
                ))}
              </div>
            )}

            {/* 힌트 */}
            {step.hint && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3.5 py-2.5">
                <p className="text-xs text-blue-800 leading-relaxed">
                  <strong className="font-semibold">Tip.</strong> {step.hint}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* navigation */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
          disabled={currentStep === 0}
          className="flex items-center gap-1 px-3 py-2.5 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          이전
        </button>

        {isLast || (isCompletionScreen && !hasInvoiceStep) ? (
          <button
            onClick={() => window.close()}
            className="flex-1 px-5 py-3 text-sm font-bold text-white bg-green-500 rounded-lg hover:bg-green-600 transition active:scale-[0.98]"
          >
            창 닫기
          </button>
        ) : (
          <button
            onClick={() => setCurrentStep(s => Math.min(steps.length - 1, s + 1))}
            className="flex-1 flex items-center justify-center gap-1 px-4 py-3 text-sm font-bold text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition active:scale-[0.98]"
          >
            {isCompletionScreen ? '운송장 등록으로' : '다음 단계'}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
