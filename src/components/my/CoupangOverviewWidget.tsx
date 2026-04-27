'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { Package, TrendingUp, Wallet, Percent, RefreshCw, Clock, AlertTriangle, ExternalLink, Copy, Check } from 'lucide-react';

interface OverviewData {
  productCount: number;
  monthlySales: number;
  monthlySettlement: number;
  monthlyCommission: number;
  yearMonth: string;
  syncedAt: string;
  ipOutdated?: boolean;
  failedIp?: string | null;
  keyExpired?: boolean;
  keyAuthFailed?: boolean;
}

// dedicated egress IP — 가이드/설정과 동일하게 유지
const REQUIRED_IPS = '209.71.88.111, 66.241.125.108, 216.246.19.71, 66.241.124.130, 216.246.19.84, 14.52.102.116, 54.116.7.181, 3.37.67.57, 79.127.159.103, 216.246.19.66';
const REQUIRED_URL = 'https://coupanglanding.vercel.app/';

function formatKRW(value: number): string {
  if (value >= 10000) {
    return `${Math.floor(value / 10000).toLocaleString()}만원`;
  }
  return `${value.toLocaleString()}원`;
}

function formatSyncTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  return `${MM}.${DD} ${hh}:${mm}`;
}

export default function CoupangOverviewWidget() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/coupang-overview');
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setSyncing(true);
    fetchData();
  };

  // 모달 상태 (IP 만료 / 키 만료)
  const [ipModalOpen, setIpModalOpen] = useState(false);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<'ips' | 'url' | null>(null);
  const handleCopy = (text: string, field: 'ips' | 'url') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (error) return null;

  if (loading) {
    return (
      <Card>
        <div className="py-6 text-center text-gray-400 text-sm">쿠팡 데이터 불러오는 중...</div>
      </Card>
    );
  }

  if (!data) return null;

  // IP 만료 배너 (가장 먼저 — 화이트리스트 문제이면 키 검증 자체 도달 불가)
  const ipBanner = data.ipOutdated ? (
    <div className="mb-4 p-4 rounded-lg border border-red-300 bg-red-50">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-800">
            쿠팡 API 연동이 IP 화이트리스트 문제로 차단되었습니다
          </p>
          <p className="text-xs text-red-700 mt-1">
            현재 호출 IP{data.failedIp ? ` ${data.failedIp}` : ''} 가 쿠팡 Wing 에 등록되지 않았어요. 영구 IP <code className="font-mono bg-white px-1 rounded">209.71.88.111</code> 등 최신 목록으로 업데이트가 필요합니다.
          </p>
          <button
            type="button"
            onClick={() => setIpModalOpen(true)}
            className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition"
          >
            IP 업데이트 가이드 보기
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // 키 만료/인증실패 배너 (IP 정상이지만 인증 실패 시)
  const keyBanner = (!data.ipOutdated && (data.keyExpired || data.keyAuthFailed)) ? (
    <div className="mb-4 p-4 rounded-lg border border-orange-300 bg-orange-50">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-orange-800">
            {data.keyExpired ? '쿠팡 API 키가 만료되었습니다' : '쿠팡 API 인증에 실패했습니다'}
          </p>
          <p className="text-xs text-orange-700 mt-1">
            {data.keyExpired
              ? 'Wing 에서 발급한 OPEN API 키 유효기간이 끝났어요. 재발급 후 새 키로 다시 등록해주세요.'
              : 'Access Key 또는 Secret Key 가 일치하지 않습니다. 키 만료, 잘못된 입력, 또는 키 회수 가능성이 있어요. Wing 에서 키를 다시 확인해주세요.'}
          </p>
          <button
            type="button"
            onClick={() => setKeyModalOpen(true)}
            className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition"
          >
            API 키 재발급 가이드 보기
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const monthLabel = data.yearMonth.replace('-', '년 ') + '월';

  const stats = [
    {
      label: '총 등록 상품',
      value: `${data.productCount.toLocaleString()}개`,
      icon: <Package className="w-5 h-5" />,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: `${monthLabel} 매출`,
      value: formatKRW(data.monthlySales),
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'bg-green-50 text-green-600',
    },
    {
      label: `${monthLabel} 정산액`,
      value: formatKRW(data.monthlySettlement),
      icon: <Wallet className="w-5 h-5" />,
      color: 'bg-purple-50 text-purple-600',
    },
    {
      label: `${monthLabel} 수수료`,
      value: formatKRW(data.monthlyCommission),
      icon: <Percent className="w-5 h-5" />,
      color: 'bg-orange-50 text-orange-600',
    },
  ];

  return (
    <Card>
      {ipBanner}
      {keyBanner}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">쿠팡 연동 현황</h2>
        <div className="flex items-center gap-2">
          {data?.syncedAt && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {formatSyncTime(data.syncedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={syncing}
            className="p-1.5 rounded-lg text-gray-400 hover:text-[#E31837] hover:bg-red-50 transition disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${stat.color}`}>
              {stat.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-gray-500 truncate">{stat.label}</p>
              <p className="text-lg font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={ipModalOpen} onClose={() => setIpModalOpen(false)} title="쿠팡 Wing IP 업데이트 가이드" maxWidth="max-w-2xl">
        <div className="space-y-4 text-sm">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-300">
            <p className="text-xs text-amber-800 font-medium">
              우리 인프라가 영구 고정 IP <code className="font-mono bg-white px-1 rounded">209.71.88.111</code> 로 전환되었습니다. Wing 에 등록된 옛 IP 목록을 아래로 갱신해주세요.
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
              마이페이지 → 추가판매정보 → OPEN API 키 발급 섹션 하단 "연동 정보" 옆 <b>"수정"</b> 버튼 클릭
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
                onClick={() => handleCopy(REQUIRED_IPS, 'ips')}
                className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded hover:bg-gray-50"
              >
                {copiedField === 'ips' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
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
                onClick={() => handleCopy(REQUIRED_URL, 'url')}
                className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded hover:bg-gray-50"
              >
                {copiedField === 'url' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
              </button>
            </div>
          </div>

          <div>
            <p className="font-bold text-gray-900 mb-2">4단계 — 저장 후 5~15분 대기</p>
            <p className="text-xs text-gray-600">
              Wing 의 IP 화이트리스트 변경은 쿠팡 API Gateway 캐시 갱신에 5~15분 (길게 30분) 소요. 잠시 후 아래 버튼으로 재테스트.
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
      </Modal>

      <Modal isOpen={keyModalOpen} onClose={() => setKeyModalOpen(false)} title="쿠팡 API 키 재발급 가이드" maxWidth="max-w-2xl">
        <div className="space-y-4 text-sm">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-300">
            <p className="text-xs text-amber-800 font-medium">
              쿠팡 OpenAPI 키는 발급일로부터 <b>최대 6개월</b> 유효. 만료되면 모든 API 호출이 401 로 거부됩니다. 아래 절차로 재발급 후 새 키를 앱에 다시 입력해주세요.
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
              표시된 키 행의 <b>재발급</b> 버튼을 누르면 새 Access Key + Secret Key 가 생성됩니다.
            </p>
            <div className="mt-2 p-2.5 bg-red-50 border border-red-300 rounded">
              <p className="text-xs text-red-800 font-bold">⚠ Secret Key 는 발급 직후 단 1회만 노출됩니다</p>
              <p className="text-xs text-red-700 mt-0.5">
                창을 닫기 전에 반드시 복사. 닫으면 다시 못 보고 또 재발급해야 함.
              </p>
            </div>
          </div>

          <div>
            <p className="font-bold text-gray-900 mb-2">3단계 — 3가지 값 모두 복사</p>
            <ul className="text-xs text-gray-600 list-disc pl-5 space-y-1">
              <li><b>업체코드</b> (Vendor ID) — 보통 변경 없음 (예: A01526382)</li>
              <li><b>Access Key</b> — 새 값 (예: 40ee65d8-...)</li>
              <li><b>Secret Key</b> — 새 값 (예: 127b763d8d...) <span className="text-red-600">⚠ 발급창에서만 확인 가능</span></li>
            </ul>
          </div>

          <div>
            <p className="font-bold text-gray-900 mb-2">4단계 — 앱 설정에서 새 키 입력</p>
            <p className="text-xs text-gray-600">
              <b>설정 → 쿠팡 API 연동</b> 화면에서 위 3가지를 새 값으로 덮어쓰고 <b>"새 키로 저장"</b> 클릭.
              저장 후 <b>"연동 테스트"</b> 가 200 (정상) 응답하면 완료.
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
      </Modal>
    </Card>
  );
}
