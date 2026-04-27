'use client';

import { useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/ui/Modal';
import { AlertTriangle, Clock, ExternalLink, Copy, Check, Wrench, Server } from 'lucide-react';

export type CoupangAlertKind =
  | 'ip_outdated'
  | 'key_expired'
  | 'key_auth_failed'
  | 'rate_limited'
  | 'server_error'
  | 'proxy_unreachable'
  | 'timeout';

interface Props {
  alert: CoupangAlertKind;
  failedIp?: string | null;
}

// dedicated egress IP — 가이드와 동일하게 유지
const REQUIRED_IPS = '209.71.88.111, 66.241.125.108, 216.246.19.71, 66.241.124.130, 216.246.19.84, 14.52.102.116, 54.116.7.181, 3.37.67.57, 79.127.159.103, 216.246.19.66';
const REQUIRED_URL = 'https://coupanglanding.vercel.app/';

/**
 * 쿠팡 API 실패 케이스 — 비기술 사용자 친화적 배너 + 액션 모달.
 *
 * 7가지 실패 시나리오 모두 동일한 3단 구조 ("뭐가 문제 / 어디 가서 / 뭘 해야") 로 안내.
 */
export default function CoupangApiAlert({ alert, failedIp }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState<'ips' | 'url' | null>(null);
  const handleCopy = (text: string, field: 'ips' | 'url') => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const config = ALERT_CONFIG[alert];
  if (!config) return null;

  return (
    <div className={`mb-4 p-4 rounded-lg border ${config.borderClass} ${config.bgClass}`}>
      <div className="flex items-start gap-3">
        <config.Icon className={`w-5 h-5 ${config.iconClass} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${config.titleClass}`}>
            {config.title}
          </p>
          <div className={`text-xs ${config.bodyClass} mt-1.5 leading-relaxed space-y-1`}>
            <p>
              <b>무엇이 문제인지:</b>{' '}
              {alert === 'ip_outdated' && failedIp
                ? `쿠팡이 우리 서버 IP(${failedIp})를 모르고 있어요. Wing 에 등록한 IP 가 옛날 거라 모든 쿠팡 기능(상품 등록·매출 조회 등)이 차단된 상태예요.`
                : config.what}
            </p>
            {config.where && (
              <p>
                <b>어디 가서:</b> {config.where}
              </p>
            )}
            {config.what_to_do && (
              <p>
                <b>뭘 해야:</b> {config.what_to_do}
              </p>
            )}
          </div>
          {config.actionLabel && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className={`mt-2.5 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white ${config.buttonClass} rounded-lg transition`}
            >
              {config.actionLabel}
            </button>
          )}
        </div>
      </div>

      {/* 모달 — 케이스별 상세 가이드 */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={config.modalTitle || config.title} maxWidth="max-w-2xl">
        {alert === 'ip_outdated' && (
          <IpUpdateModalBody copied={copied} onCopy={handleCopy} />
        )}
        {(alert === 'key_expired' || alert === 'key_auth_failed') && (
          <KeyReissueModalBody />
        )}
        {alert === 'rate_limited' && (
          <SimpleModalBody
            heading="쿠팡 API 호출 한도 초과"
            paragraphs={[
              '쿠팡은 단시간에 너무 많은 요청을 받으면 일시적으로 차단해요.',
              '특별히 할 일은 없어요 — 5~10분 정도 자동으로 풀립니다. 그동안 다른 작업을 하시거나 잠시 기다려주세요.',
              '계속 발생하면 한 번에 너무 많은 상품을 등록하지 않고 작은 단위로 나눠서 시도하세요.',
            ]}
          />
        )}
        {alert === 'server_error' && (
          <SimpleModalBody
            heading="쿠팡 서버 일시 오류"
            paragraphs={[
              '쿠팡 측 서버에서 일시적인 문제가 발생했어요. 우리 서비스 문제가 아닙니다.',
              '대개 몇 분 안에 자동 복구됩니다. 잠시 후 다시 시도해주세요.',
              '30분 이상 지속되면 쿠팡 셀러 콜센터(1600-9879)에 직접 문의해보세요.',
            ]}
          />
        )}
        {alert === 'proxy_unreachable' && (
          <SimpleModalBody
            heading="중계 서버 연결 실패"
            paragraphs={[
              '우리 쪽 중계 서버(Fly.io)와 통신이 끊겼어요.',
              '대부분 30초~1분 안에 자동 복구됩니다. 페이지를 새로고침해보세요.',
              '계속되면 운영팀에 문의 부탁드려요. (이 경우는 기술팀 조치가 필요해요)',
            ]}
          />
        )}
        {alert === 'timeout' && (
          <SimpleModalBody
            heading="응답 시간 초과"
            paragraphs={[
              '쿠팡 API 응답이 평소보다 오래 걸리고 있어요.',
              '잠시 후 다시 시도해주세요. 보통 자동으로 회복됩니다.',
              '한 번에 너무 많은 데이터를 조회하면 발생할 수 있어요. 더 작은 단위로 나눠서 시도해보세요.',
            ]}
          />
        )}
      </Modal>
    </div>
  );
}

// ─── 모달 본문 컴포넌트들 ────────────────────────────────────

function IpUpdateModalBody({
  copied,
  onCopy,
}: {
  copied: 'ips' | 'url' | null;
  onCopy: (text: string, field: 'ips' | 'url') => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div className="p-3 rounded-lg bg-amber-50 border border-amber-300">
        <p className="text-xs text-amber-800 font-medium">
          우리 서버가 영구 고정 IP <code className="font-mono bg-white px-1 rounded">209.71.88.111</code> 로 전환됐어요. Wing 에 등록된 옛 IP 목록을 아래로 갱신해주시면 다시 정상 작동합니다.
        </p>
      </div>

      <div>
        <p className="font-bold text-gray-900 mb-2">1단계 — 쿠팡 Wing 접속</p>
        <a
          href="https://wing.coupang.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-blue-700 border border-blue-300 rounded hover:bg-blue-50"
        >
          wing.coupang.com 열기 <ExternalLink className="w-3 h-3" />
        </a>
        <p className="mt-2 text-xs text-gray-600">
          마이페이지 → 추가판매정보 → OPEN API 키 발급 섹션 → "연동 정보" 옆 <b>"수정"</b> 버튼
        </p>
      </div>

      <div>
        <p className="font-bold text-gray-900 mb-2">2단계 — IP주소 (10개) 전체 교체</p>
        <div className="relative">
          <p className="text-xs font-mono text-gray-900 bg-gray-50 p-3 rounded border border-gray-200 break-all leading-relaxed pr-12">
            {REQUIRED_IPS}
          </p>
          <button
            type="button"
            onClick={() => onCopy(REQUIRED_IPS, 'ips')}
            className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded hover:bg-gray-50"
          >
            {copied === 'ips' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
          </button>
        </div>
      </div>

      <div>
        <p className="font-bold text-gray-900 mb-2">3단계 — URL</p>
        <div className="relative">
          <p className="text-xs font-mono text-gray-900 bg-gray-50 p-3 rounded border border-gray-200 pr-12">
            {REQUIRED_URL}
          </p>
          <button
            type="button"
            onClick={() => onCopy(REQUIRED_URL, 'url')}
            className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded hover:bg-gray-50"
          >
            {copied === 'url' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
          </button>
        </div>
      </div>

      <div>
        <p className="font-bold text-gray-900 mb-2">4단계 — 저장 후 5~15분 대기</p>
        <p className="text-xs text-gray-600">
          Wing 의 IP 변경은 쿠팡 측 적용에 5~15분 (길게 30분) 소요. 그 사이엔 그대로 두시면 자동 복구됩니다.
        </p>
      </div>

      <div className="pt-3 border-t border-gray-200">
        <Link
          href="/my/settings"
          className="inline-flex items-center gap-1 px-4 py-2 text-sm font-bold text-white bg-[#E31837] hover:bg-[#c01530] rounded-lg"
        >
          설정으로 이동 → 연동 테스트
        </Link>
      </div>
    </div>
  );
}

function KeyReissueModalBody() {
  return (
    <div className="space-y-4 text-sm">
      <div className="p-3 rounded-lg bg-amber-50 border border-amber-300">
        <p className="text-xs text-amber-800 font-medium">
          쿠팡 OpenAPI 키는 발급일로부터 <b>최대 6개월</b> 유효. 만료되면 모든 API 호출이 거부됩니다. 아래 절차로 재발급 후 새 키를 우리 앱에 다시 입력해주세요.
        </p>
      </div>

      <div>
        <p className="font-bold text-gray-900 mb-2">1단계 — 쿠팡 Wing 접속</p>
        <a
          href="https://wing.coupang.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-blue-700 border border-blue-300 rounded hover:bg-blue-50"
        >
          wing.coupang.com 열기 <ExternalLink className="w-3 h-3" />
        </a>
        <p className="mt-2 text-xs text-gray-600">
          마이페이지 → 추가판매정보 → <b>OPEN API 키 발급</b> 섹션
        </p>
      </div>

      <div>
        <p className="font-bold text-gray-900 mb-2">2단계 — 기존 키 옆 "재발급" 클릭</p>
        <p className="text-xs text-gray-600">
          새 Access Key 와 Secret Key 가 화면에 표시됩니다.
        </p>
        <div className="mt-2 p-2.5 bg-red-50 border border-red-300 rounded">
          <p className="text-xs text-red-800 font-bold">⚠ Secret Key 는 발급 직후 단 1회만 노출돼요</p>
          <p className="text-xs text-red-700 mt-0.5">
            창을 닫기 전에 반드시 복사. 닫으면 다시 못 봐서 또 재발급해야 해요.
          </p>
        </div>
      </div>

      <div>
        <p className="font-bold text-gray-900 mb-2">3단계 — 3가지 값 모두 복사</p>
        <ul className="text-xs text-gray-600 list-disc pl-5 space-y-1">
          <li><b>업체코드</b> (Vendor ID) — 보통 변경 없음</li>
          <li><b>Access Key</b> — 새 값</li>
          <li><b>Secret Key</b> — 새 값 <span className="text-red-600">⚠ 발급창에서만 확인 가능</span></li>
        </ul>
      </div>

      <div>
        <p className="font-bold text-gray-900 mb-2">4단계 — 우리 앱 설정에 새 키 입력</p>
        <p className="text-xs text-gray-600">
          <b>설정 → 쿠팡 API 연동</b> 화면에서 위 3가지를 새 값으로 덮어쓰고 <b>"새 키로 저장"</b> 클릭. 저장 후 <b>"연동 테스트"</b> 가 정상이면 끝.
        </p>
      </div>

      <div className="pt-3 border-t border-gray-200">
        <Link
          href="/my/settings"
          className="inline-flex items-center gap-1 px-4 py-2 text-sm font-bold text-white bg-[#E31837] hover:bg-[#c01530] rounded-lg"
        >
          설정으로 이동 → 새 키 입력
        </Link>
      </div>
    </div>
  );
}

function SimpleModalBody({ heading, paragraphs }: { heading: string; paragraphs: string[] }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-bold text-gray-900">{heading}</p>
      {paragraphs.map((p, i) => (
        <p key={i} className="text-gray-700 leading-relaxed">{p}</p>
      ))}
    </div>
  );
}

// ─── 케이스별 설정 ──────────────────────────────────────────

interface AlertConfig {
  Icon: typeof AlertTriangle;
  title: string;
  what: string;
  where?: string;
  what_to_do?: string;
  actionLabel?: string;
  modalTitle?: string;
  // Tailwind 색상
  borderClass: string;
  bgClass: string;
  iconClass: string;
  titleClass: string;
  bodyClass: string;
  buttonClass: string;
}

const ALERT_CONFIG: Record<CoupangAlertKind, AlertConfig> = {
  ip_outdated: {
    Icon: AlertTriangle,
    title: '🚨 쿠팡 연동이 끊겼어요 — IP 정보 수정 필요',
    what: '쿠팡 Wing 에 등록한 IP 가 최신이 아니에요. 그래서 모든 쿠팡 기능이 막혀있어요.',
    where: '쿠팡 Wing → 마이페이지 → 추가판매정보 → 연동 정보 "수정" 버튼',
    what_to_do: '아래 버튼 눌러 가이드 열고 → IP 10개 통째로 복사 → Wing 에 붙여넣고 저장 → 5~15분 대기',
    actionLabel: '지금 IP 수정하러 가기',
    modalTitle: '쿠팡 Wing IP 업데이트 가이드',
    borderClass: 'border-red-300',
    bgClass: 'bg-red-50',
    iconClass: 'text-red-600',
    titleClass: 'text-red-800',
    bodyClass: 'text-red-700',
    buttonClass: 'bg-red-600 hover:bg-red-700',
  },
  key_expired: {
    Icon: AlertTriangle,
    title: '🚨 쿠팡 API 키 유효기간이 끝났어요 — 새로 발급받으세요',
    what: '쿠팡에서 받은 OPEN API 키는 6개월짜리예요. 그 기간이 끝나서 자동으로 막혔어요.',
    where: '쿠팡 Wing → 마이페이지 → 추가판매정보 → OPEN API 섹션 → 기존 키 옆 "재발급" 버튼',
    what_to_do: '새 Access Key + Secret Key 받기 (⚠ Secret Key 는 발급 직후 1번만 보임 — 즉시 복사!) → 우리 앱 설정에 새 키 붙여넣고 저장',
    actionLabel: '지금 키 재발급하러 가기',
    modalTitle: '쿠팡 API 키 재발급 가이드',
    borderClass: 'border-orange-300',
    bgClass: 'bg-orange-50',
    iconClass: 'text-orange-600',
    titleClass: 'text-orange-800',
    bodyClass: 'text-orange-700',
    buttonClass: 'bg-orange-600 hover:bg-orange-700',
  },
  key_auth_failed: {
    Icon: AlertTriangle,
    title: '🚨 쿠팡 API 인증 실패 — 키를 다시 확인하거나 새로 발급받으세요',
    what: 'Access Key 또는 Secret Key 가 잘못됐거나 만료됐어요. 쿠팡이 인증을 거부하고 있어요.',
    where: '쿠팡 Wing → 마이페이지 → 추가판매정보 → OPEN API 섹션',
    what_to_do: '기존 키 옆 "재발급" → 새 Access/Secret Key 받기 (⚠ Secret Key 1회만 노출) → 우리 앱 설정에 입력',
    actionLabel: '지금 키 재발급하러 가기',
    modalTitle: '쿠팡 API 키 재발급 가이드',
    borderClass: 'border-orange-300',
    bgClass: 'bg-orange-50',
    iconClass: 'text-orange-600',
    titleClass: 'text-orange-800',
    bodyClass: 'text-orange-700',
    buttonClass: 'bg-orange-600 hover:bg-orange-700',
  },
  rate_limited: {
    Icon: Clock,
    title: '⏳ 쿠팡 호출 한도를 초과했어요 — 잠시 후 자동 복구',
    what: '쿠팡이 단시간에 너무 많은 요청을 받아서 잠시 차단했어요.',
    where: '아무 데도 안 가셔도 돼요. 쿠팡 측 자동 회복 대기 중.',
    what_to_do: '5~10분 후 자동으로 풀립니다. 그동안 다른 작업을 하시거나 잠시 기다리세요.',
    actionLabel: '자세히 보기',
    modalTitle: '쿠팡 호출 한도 초과',
    borderClass: 'border-yellow-300',
    bgClass: 'bg-yellow-50',
    iconClass: 'text-yellow-700',
    titleClass: 'text-yellow-900',
    bodyClass: 'text-yellow-800',
    buttonClass: 'bg-yellow-600 hover:bg-yellow-700',
  },
  server_error: {
    Icon: Server,
    title: '🛠 쿠팡 서버 일시 오류 — 우리 문제가 아니에요',
    what: '쿠팡 측 서버에서 일시적인 문제가 발생했어요. 보통 몇 분 안에 자동 복구됩니다.',
    where: '아무 데도 안 가셔도 돼요. 쿠팡 측 복구 대기.',
    what_to_do: '잠시 후 다시 시도. 30분 이상 지속되면 쿠팡 셀러 콜센터(1600-9879) 문의.',
    actionLabel: '자세히 보기',
    modalTitle: '쿠팡 서버 일시 오류',
    borderClass: 'border-gray-300',
    bgClass: 'bg-gray-50',
    iconClass: 'text-gray-600',
    titleClass: 'text-gray-900',
    bodyClass: 'text-gray-700',
    buttonClass: 'bg-gray-700 hover:bg-gray-800',
  },
  proxy_unreachable: {
    Icon: Wrench,
    title: '🛠 중계 서버 연결 실패 — 잠시 후 자동 복구',
    what: '우리 쪽 중계 서버(쿠팡 호출 통로)와 통신이 끊겼어요.',
    where: '아무 데도 안 가셔도 돼요. 보통 30초~1분 안에 자동 복구.',
    what_to_do: '페이지를 새로고침해보세요. 계속되면 운영팀에 문의.',
    actionLabel: '자세히 보기',
    modalTitle: '중계 서버 연결 실패',
    borderClass: 'border-red-300',
    bgClass: 'bg-red-50',
    iconClass: 'text-red-600',
    titleClass: 'text-red-800',
    bodyClass: 'text-red-700',
    buttonClass: 'bg-red-600 hover:bg-red-700',
  },
  timeout: {
    Icon: Clock,
    title: '⏳ 응답 시간 초과 — 잠시 후 다시 시도',
    what: '쿠팡 API 응답이 평소보다 오래 걸리고 있어요.',
    where: '아무 데도 안 가셔도 돼요.',
    what_to_do: '잠시 후 다시 시도. 큰 데이터 조회면 더 작은 단위로 나눠서 시도하세요.',
    actionLabel: '자세히 보기',
    modalTitle: '응답 시간 초과',
    borderClass: 'border-yellow-300',
    bgClass: 'bg-yellow-50',
    iconClass: 'text-yellow-700',
    titleClass: 'text-yellow-900',
    bodyClass: 'text-yellow-800',
    buttonClass: 'bg-yellow-600 hover:bg-yellow-700',
  },
};
