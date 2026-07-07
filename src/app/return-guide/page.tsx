'use client';

import { useState, useEffect } from 'react';
import {
  Copy, Check, ChevronLeft, ChevronRight, RotateCcw, ExternalLink,
  User, Phone, Home, UserCheck, Smartphone, MapPin, Package,
  CheckCircle2, PlayCircle, ClipboardList, Truck, Loader2, AlertCircle,
  FileText, ShieldCheck, Coins, Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface AddressInfo {
  name: string;
  phone: string;
  address: string;
}

/** 반품 상품 정보 — CJ 상품정보 단계 매칭용 */
interface ProductInfo {
  name?: string | null;
  price?: number | null;
  qty?: number | null;
}

/**
 * 전화번호를 앞/중간/뒤 3부분으로 분리 — CJ·우체국 모두 전화 입력이 3칸으로 나뉘어 있고
 * 풀번호를 붙여넣어도 자동 분리가 안 되므로, 각 칸에 붙여넣을 수 있게 쪼갠다.
 */
function splitPhone(phone: string): { p1: string; p2: string; p3: string } | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (trimmed.includes('-')) {
    const parts = trimmed.split('-').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 3) return { p1: parts[0], p2: parts[1], p3: parts[2] };
  }
  const d = trimmed.replace(/[^0-9]/g, '');
  if (d.length === 11) return { p1: d.slice(0, 3), p2: d.slice(3, 7), p3: d.slice(7) };
  if (d.length === 10) {
    return d.startsWith('02')
      ? { p1: '02', p2: d.slice(2, 6), p3: d.slice(6) }
      : { p1: d.slice(0, 3), p2: d.slice(3, 6), p3: d.slice(6) };
  }
  return null;
}

/** 전화번호 복사 카드 — 3칸 분리 성공 시 앞/중간/뒤 3개, 아니면 통짜 1개. */
function phoneCopies(phone: string): { label: string; value: string }[] {
  const sp = splitPhone(phone);
  if (sp) {
    return [
      { label: '연락처 · 앞자리', value: sp.p1 },
      { label: '중간자리', value: sp.p2 },
      { label: '뒷자리', value: sp.p3 },
    ];
  }
  return [{ label: '연락처', value: phone }];
}

interface GuideStep {
  icon: LucideIcon;
  title: string;
  description: string;
  copies?: { label: string; value: string }[];
  hint?: string;
}

const SESSION_KEY = 'megaload_return_guide';

// ★ CJ대한통운 "개인택배예약(방문접수, reservation-general)" 폼 순서에 매칭.
//   보내는분(구매자)·받는분(창고)·상품명을 모두 직접 입력하는 페이지.
//   ※ "반품예약" 페이지는 원래 CJ 송장을 원운송장 조회로 역조회하는 전용 — 받는분·상품칸이
//     잠겨(disabled/readonly) 있어, 원배송 택배사가 제각각인 쿠팡 반품엔 못 씀 → 개인택배예약 사용.
function buildCjSteps(sender: AddressInfo, dest: AddressInfo, product?: ProductInfo): GuideStep[] {
  return [
    {
      icon: PlayCircle,
      title: '준비하기',
      description: '오른쪽에 CJ대한통운 "개인택배예약(방문접수)" 페이지가 열렸는지 확인하세요. 안 열렸으면 위쪽 빨간 버튼을 누르세요. 반품 상품을 구매자 → 우리 창고로 보내는 접수입니다.',
      hint: '이 창을 사이트 옆에 두고 순서대로 따라 하면 됩니다.',
    },
    {
      icon: FileText,
      title: '1단계 · 약관 동의',
      description: '"홈페이지 이용약관", "택배 이용약관", "만 14세 이상"에 각각 체크하거나 맨 아래 "위 항목을 모두 동의합니다"를 체크한 뒤 [다음 단계로] 버튼을 누르세요.',
      hint: '약관에 동의해야 다음 단계로 넘어갑니다.',
    },
    {
      icon: ShieldCheck,
      title: '2단계 · 개인정보 수집 동의',
      description: '"개인정보 수집 및 이용안내에 동의합니다"에 체크하세요. 그 아래 이메일·비밀번호는 예약 확인용 선택 항목이라 비워둬도 됩니다.',
      hint: '필수 항목만 체크하면 됩니다.',
    },
    {
      icon: User,
      title: '보내는 분(구매자) 이름',
      description: '3단계 "보내는 분" 이름 칸을 클릭하고, 아래 복사 버튼을 누른 뒤 Ctrl+V로 붙여넣으세요.',
      copies: [{ label: '보내는 분 이름', value: sender.name }],
      hint: '"보내는 분"은 반품 상품을 보내는 구매자입니다.',
    },
    {
      icon: Phone,
      title: '보내는 분 연락처',
      description: '"보내는 분" 휴대폰번호는 앞/중간/뒤 3칸으로 나뉘어 있습니다. 아래 3개 값을 각 칸에 순서대로 붙여넣으세요.',
      copies: phoneCopies(sender.phone),
      hint: '휴대폰번호 또는 전화번호 중 1개는 반드시 입력해야 합니다.',
    },
    {
      icon: Home,
      title: '보내는 분 주소',
      description: '"주소검색" 버튼을 눌러 검색창을 연 뒤 아래 주소로 검색하고 선택하세요. 상세주소가 자동으로 안 채워지면 직접 입력하세요.',
      copies: [{ label: '주소', value: sender.address }],
      hint: '도로명이나 동 이름으로 검색하면 더 잘 찾아집니다.',
    },
    {
      icon: UserCheck,
      title: '받는 분(도착지) 이름',
      description: '이제 "받는 분" 차례입니다. "받는 분" 이름 칸에 아래 이름을 붙여넣으세요.',
      copies: [{ label: '받는 분 이름', value: dest.name }],
      hint: '"받는 분"은 반품이 도착할 우리 창고(또는 공급처)입니다.',
    },
    {
      icon: Smartphone,
      title: '받는 분 연락처',
      description: '"받는 분" 휴대폰번호 3칸(앞/중간/뒤)에 아래 값을 각각 붙여넣으세요.',
      copies: phoneCopies(dest.phone),
      hint: '거의 다 왔습니다.',
    },
    {
      icon: MapPin,
      title: '받는 분 주소',
      description: '"받는 분 주소검색"을 눌러 검색창을 연 뒤 아래 주소로 검색하세요.',
      copies: [{ label: '주소', value: dest.address }],
      hint: '상세주소가 비어 있으면 직접 입력해 주세요.',
    },
    {
      icon: ClipboardList,
      title: '상품정보 유의사항 동의',
      description: '상품 정보 영역에서 "상품 정보 유의사항 보기"를 눌러 확인한 뒤, "유의사항 안내를 확인하였으며 이에 동의합니다"에 체크하세요.',
      hint: '체크해야 예약 신청 버튼이 활성화됩니다.',
    },
    {
      icon: Package,
      title: '상품명 입력',
      description: product?.name
        ? '"상품명" 칸에 아래 값을 붙여넣으세요.'
        : '"상품명" 칸에 품목을 적으세요. 예: 의류, 잡화, 신발.',
      copies: [{ label: '상품명', value: product?.name || '의류' }],
      hint: '상품명은 사고 시 배상 기준이 되니 구체적으로 적는 것이 좋습니다.',
    },
    {
      icon: Coins,
      title: '상품가격 · 포장수량 · 부피',
      description: '"상품가격"을 입력하고, "포장수량"은 보통 1, "부피"는 상품 크기에 맞게(대부분 "소" 또는 "중")로 선택하세요.',
      ...(product?.price ? { copies: [{ label: '상품가격(원)', value: String(product.price) }] } : {}),
      hint: '2박스 이상이면 1박스당 가격을 적으세요. 300만원 초과 상품은 접수 불가입니다.',
    },
    {
      icon: Calendar,
      title: '방문 희망일 선택',
      description: '택배기사가 구매자에게 방문할 "방문희망일"을 선택하세요. 보통 다음 영업일이 기본으로 잡혀 있습니다.',
      hint: '오전/오후·특정 시간 지정은 반영되지 않습니다.',
    },
    {
      icon: CheckCircle2,
      title: '예약 신청하기',
      description: '맨 아래 [예약 신청하기] 버튼을 눌러 최종 접수하세요.',
      hint: '이 버튼을 누르면 반품 수거 접수가 완료됩니다.',
    },
    {
      icon: CheckCircle2,
      title: '접수가 완료되었습니다',
      description: '',
    },
  ];
}

// ★ 실제 우체국 "방문접수소포 반품예약"(general.RetrieveGeneralGubunLoginReturn) 폼 순서에 매칭.
//   실제 폼: 취급제한품목·손해배상 동의 → 01 보내는 분 → 02 방문접수 소포정보 →
//   03 받는 분 → 04 물품정보 → [받는 분 목록에 추가] → (사전결제 시 06 결제) → [신청].
function buildEpostSteps(sender: AddressInfo, dest: AddressInfo, product?: ProductInfo): GuideStep[] {
  return [
    {
      icon: PlayCircle,
      title: '준비하기',
      description: '오른쪽에 우체국 "방문접수소포 반품예약" 페이지가 열렸는지 확인하세요. 안 열렸으면 위쪽 빨간 버튼을 누르세요.',
      hint: '이 창을 사이트 옆에 두고 순서대로 따라 하세요.',
    },
    {
      icon: ShieldCheck,
      title: '취급제한품목·손해배상 안내 확인',
      description: '맨 위 "우편금지물품·취급제한품목 및 손해배상 안내 확인"에 체크하세요. (필수)',
      hint: '이 체크를 안 하면 마지막에 신청이 안 됩니다.',
    },
    {
      icon: User,
      title: '01 보내는 분(구매자) 이름',
      description: '"01 보내는 분" 이름 칸을 클릭하고, 아래 복사 버튼을 누른 뒤 Ctrl+V로 붙여넣으세요.',
      copies: [{ label: '보내는 분 이름', value: sender.name }],
      hint: '"보내는 분"은 반품 상품을 보내는 구매자입니다.',
    },
    {
      icon: Home,
      title: '보내는 분 주소',
      description: '"주소찾기" 버튼을 눌러 아래 주소로 검색·선택하세요. 우편번호가 자동 입력되고, 상세주소를 확인하세요.',
      copies: [{ label: '주소', value: sender.address }],
      hint: '도로명/동 이름으로 검색하면 잘 찾아집니다.',
    },
    {
      icon: Phone,
      title: '보내는 분 연락처',
      description: '"휴대전화"는 앞/중간/뒤 3칸입니다. 아래 3개 값을 각 칸에 순서대로 붙여넣으세요.',
      copies: phoneCopies(sender.phone),
      hint: '휴대전화 또는 일반전화 중 하나는 필수입니다.',
    },
    {
      icon: Calendar,
      title: '02 방문접수 소포정보',
      description: '"요금부담여부"를 고르고(반품은 보통 착불), "희망방문접수일"을 선택하세요. 사전결제를 고르면 "보관장소"도 선택해야 합니다.',
      hint: '착불로 하면 받는 분(창고)이 요금을 부담합니다.',
    },
    {
      icon: UserCheck,
      title: '03 받는 분(도착지) 이름',
      description: '"03 받는 분" 이름 칸에 아래 이름을 붙여넣으세요.',
      copies: [{ label: '받는 분 이름', value: dest.name }],
      hint: '"받는 분"은 반품이 도착할 우리 창고(또는 공급처)입니다.',
    },
    {
      icon: MapPin,
      title: '받는 분 주소',
      description: '"주소찾기"를 눌러 아래 주소로 검색하세요.',
      copies: [{ label: '주소', value: dest.address }],
      hint: '상세주소가 비어 있으면 직접 입력하세요.',
    },
    {
      icon: Smartphone,
      title: '받는 분 연락처',
      description: '"휴대전화" 3칸(앞/중간/뒤)에 아래 값을 각각 붙여넣으세요.',
      copies: phoneCopies(dest.phone),
      hint: '휴대전화 또는 일반전화 중 하나는 필수입니다.',
    },
    {
      icon: Package,
      title: '04 물품정보 — 규격·내용물',
      description: product?.name
        ? '"포장박스크기"에서 중량(예: 5kg)·크기(예: 80cm)를 고르고, "내용물코드"는 [25]의류/패션잡화 등 알맞게 선택, "내용물"에는 아래 상품명을 붙여넣으세요.'
        : '"포장박스크기"에서 중량(예: 5kg)·크기(예: 80cm)를 고르고, "내용물코드"([25]의류/패션잡화 등)와 "내용물"(품목)을 입력하세요.',
      copies: [{ label: '내용물(상품명)', value: product?.name || '의류' }],
      hint: '소포개수는 보통 1입니다.',
    },
    {
      icon: CheckCircle2,
      title: '받는 분 목록에 추가',
      description: '물품정보까지 입력했으면 "받는 분 목록에 추가" 버튼을 누르세요. "05 받는 분 목록"에 이 건이 올라갑니다.',
      hint: '이 버튼을 눌러야 신청 대상에 포함됩니다.',
    },
    {
      icon: CheckCircle2,
      title: '신청하기',
      description: '(사전결제를 골랐다면 "06 결제수단 등록"에서 카드 검증 후) 맨 아래 "신청" 버튼을 눌러 최종 접수하세요.',
      hint: '착불이면 결제 없이 바로 신청됩니다.',
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
    product?: ProductInfo;
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
      if (raw) {
        setData(JSON.parse(raw));
        return;
      }
      // Fallback: URL param `d` (base64-encoded JSON).
      // Used when this page is loaded inside a Document Picture-in-Picture
      // iframe, which doesn't share sessionStorage with the opener.
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get('d');
      if (encoded) {
        const json = decodeURIComponent(escape(atob(encoded)));
        setData(JSON.parse(json));
      }
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
    ? buildCjSteps(data.sender, data.destination, data.product)
    : buildEpostSteps(data.sender, data.destination, data.product);

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
            onClick={() => {
              // When loaded inside a Document PiP iframe, close the top window
              // (the PiP window itself), not just the iframe.
              try { window.top?.close(); } catch { /* same-origin should be allowed */ }
              try { window.close(); } catch { /* empty */ }
            }}
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
