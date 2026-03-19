'use client';

import { useState, useEffect } from 'react';
import { Download, ChevronDown, Copy, RefreshCw, Search, AlertTriangle, Info } from 'lucide-react';
import Card from '@/components/ui/Card';
import type { CoupangContract } from '@/lib/utils/coupang-api-client';

interface DownloadCouponCardProps {
  enabled: boolean;
  contractId: string;
  titleTemplate: string;
  durationDays: number;
  policies: Record<string, unknown>[];
  contracts: CoupangContract[];
  contractsRetired?: boolean;
  contractsAutoDetected?: boolean;
  onChange: (field: string, value: unknown) => void;
  onCopyPolicies: (couponId: number) => void;
  onRefreshContracts: () => void;
  copyingPolicies?: boolean;
}

export default function DownloadCouponCard({
  enabled,
  contractId,
  titleTemplate,
  durationDays,
  policies,
  contracts,
  contractsRetired,
  contractsAutoDetected,
  onChange,
  onCopyPolicies,
  onRefreshContracts,
  copyingPolicies,
}: DownloadCouponCardProps) {
  const [expanded, setExpanded] = useState(enabled);
  const [policyCouponId, setPolicyCouponId] = useState('');
  const [manualContractId, setManualContractId] = useState(contractId || '');

  useEffect(() => {
    if (enabled) setExpanded(true);
  }, [enabled]);

  // contractId prop 변경 시 로컬 상태 동기화
  useEffect(() => {
    if (contractId) setManualContractId(contractId);
  }, [contractId]);

  const handleCopyPolicies = () => {
    const id = Number(policyCouponId);
    if (id > 0) {
      onCopyPolicies(id);
    }
  };

  const handleManualContractIdChange = (value: string) => {
    setManualContractId(value);
    onChange('contract_id', value);
  };

  // 계약서가 자동 감지되었거나 API에서 가져왔으면 드롭다운 표시
  // 완전 실패(빈 배열 + retired)일 때만 수동 입력
  const showManualInput = contracts.length === 0 && contractsRetired;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-500" />
          <h3 className="text-sm font-bold text-gray-900">다운로드 쿠폰</h3>
        </div>
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                onChange('download_coupon_enabled', e.target.checked);
                setExpanded(e.target.checked);
              }}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#E31837]/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#E31837]" />
          </label>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-gray-100 rounded transition"
          >
            <ChevronDown className={`w-4 h-4 text-gray-400 transition ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && enabled && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          {/* 다운로드 쿠폰 안내 */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">다운로드 쿠폰 자동 생성</p>
              <p className="mt-1 text-blue-600">
                다운로드 쿠폰은 상품당 100개씩 묶어 자동 생성됩니다.
                생성 후 아이템 추가가 불가하므로, 100개 단위로 새 쿠폰이 만들어집니다.
              </p>
            </div>
          </div>

          {/* Contract selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700">계약서 선택</label>
              <button
                type="button"
                onClick={onRefreshContracts}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
              >
                <RefreshCw className="w-3 h-3" />
                새로고침
              </button>
            </div>

            {/* 계약서 목록이 있는 경우 (API 또는 자동 감지) */}
            {!showManualInput && contracts.length > 0 && (
              <>
                {contractsAutoDetected && (
                  <div className="flex items-start gap-2 p-2.5 mb-2 bg-green-50 rounded-lg text-xs text-green-700">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>기존 쿠폰에서 계약서 ID를 자동 감지했습니다.</span>
                  </div>
                )}
                <select
                  value={contractId}
                  onChange={(e) => onChange('contract_id', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                >
                  <option value="">계약서를 선택하세요</option>
                  {contracts.map((c) => (
                    <option key={c.contractId} value={String(c.contractId)}>
                      {c.contractName} ({c.contractStatus})
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* 계약서를 전혀 찾지 못한 경우 → 수동 입력 */}
            {showManualInput && (
              <>
                <div className="flex items-start gap-2 p-2.5 mb-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    계약서를 자동 감지하지 못했습니다.
                    쿠팡 WING에서 프로모션 계약을 먼저 체결하거나, 계약서 ID를 직접 입력해주세요.
                  </span>
                </div>
                <input
                  type="text"
                  value={manualContractId}
                  onChange={(e) => handleManualContractIdChange(e.target.value)}
                  placeholder="계약서 ID 입력"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                />
              </>
            )}
          </div>

          {/* Copy policies from existing coupon by ID */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              정책 복사 (기존 쿠폰 ID 입력)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={policyCouponId}
                onChange={(e) => setPolicyCouponId(e.target.value)}
                placeholder="쿠폰 ID 입력"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              />
              <button
                type="button"
                onClick={handleCopyPolicies}
                disabled={!policyCouponId.trim() || copyingPolicies}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                {copyingPolicies ? '복사 중...' : '정책 복사'}
              </button>
            </div>
          </div>

          {/* Policies display */}
          {policies.length > 0 && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                <Copy className="w-3 h-3" />
                <span>{policies.length}개 정책 설정됨</span>
              </div>
              <pre className="text-[10px] text-gray-400 max-h-20 overflow-y-auto">
                {JSON.stringify(policies, null, 2)}
              </pre>
            </div>
          )}

          {/* Template name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">쿠폰명 템플릿</label>
            <input
              type="text"
              value={titleTemplate}
              onChange={(e) => onChange('download_coupon_title_template', e.target.value)}
              placeholder="다운로드쿠폰 {date} #{n}"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            />
            <p className="mt-1 text-[10px] text-gray-400">
              &#123;date&#125; = 날짜, &#123;n&#125; = 쿠폰 번호 (자동 증가)
            </p>
          </div>

          {/* Duration days */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">유효기간 (일)</label>
            <input
              type="number"
              value={durationDays}
              onChange={(e) => onChange('download_coupon_duration_days', Number(e.target.value))}
              min={1}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            />
          </div>
        </div>
      )}
    </Card>
  );
}
