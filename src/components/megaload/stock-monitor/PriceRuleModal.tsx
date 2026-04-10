'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import NumberInput from '@/components/ui/NumberInput';
import type { PriceFollowRule, PriceFollowMode, PriceFollowType } from '@/lib/supabase/types';

interface MonitorLite {
  id: string;
  source_price_last: number | null;
  our_price_last: number | null;
  price_follow_rule: PriceFollowRule | null;
  productName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** 단일 모드 — 특정 모니터 수정 */
  monitor?: MonitorLite;
  /** 벌크 모드 — 여러 모니터에 동일 규칙 적용 */
  monitorIds?: string[];
}

const DEFAULT_RULE: PriceFollowRule = {
  enabled: false,
  mode: 'manual_approval',
  type: 'exact',
  min_change_pct: 1,
  max_change_pct: 30,
  follow_down: true,
  cooldown_minutes: 60,
};

function roundTo10(n: number): number {
  return Math.round(n / 10) * 10;
}

function computePreview(rule: PriceFollowRule, sourcePrice: number, ourPrice: number): number | null {
  if (!sourcePrice || sourcePrice <= 0) return null;
  let target = sourcePrice;
  switch (rule.type) {
    case 'exact':
      target = sourcePrice;
      break;
    case 'markup_amount':
      target = sourcePrice + (rule.amount ?? 0);
      break;
    case 'markup_percent':
      target = Math.round(sourcePrice * (1 + (rule.percent ?? 0) / 100));
      break;
    case 'fixed_margin':
      if (typeof rule.captured_margin === 'number') {
        target = sourcePrice + rule.captured_margin;
      } else {
        // 미캡처 상태에서는 현재가 - 소스가로 미리보기
        if (ourPrice && sourcePrice) return ourPrice;
        return null;
      }
      break;
  }
  return roundTo10(target);
}

export default function PriceRuleModal({ open, onClose, onSaved, monitor, monitorIds }: Props) {
  const isBulk = !monitor && Array.isArray(monitorIds);
  const [rule, setRule] = useState<PriceFollowRule>(() => monitor?.price_follow_rule || { ...DEFAULT_RULE });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoConfirm, setAutoConfirm] = useState(false);

  const sourcePrice = monitor?.source_price_last ?? 0;
  const ourPrice = monitor?.our_price_last ?? 0;

  const preview = useMemo(() => {
    if (isBulk) return null;
    return computePreview(rule, sourcePrice, ourPrice);
  }, [rule, sourcePrice, ourPrice, isBulk]);

  const previewDelta = useMemo(() => {
    if (!preview || !ourPrice) return null;
    const diff = preview - ourPrice;
    const pct = (diff / ourPrice) * 100;
    return { diff, pct };
  }, [preview, ourPrice]);

  const needsAutoConfirm = rule.enabled && rule.mode === 'auto' && !autoConfirm;

  const handleSave = async (enableOverride?: boolean) => {
    setSaving(true);
    setError(null);

    const payload: PriceFollowRule = {
      ...rule,
      enabled: enableOverride !== undefined ? enableOverride : rule.enabled,
    };

    try {
      if (isBulk) {
        const res = await fetch('/api/megaload/stock-monitor/price-rule-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monitorIds, rule: payload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '저장 실패');
      } else if (monitor) {
        const res = await fetch('/api/megaload/stock-monitor/price-rule', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monitorId: monitor.id, rule: payload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '저장 실패');
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm('가격 추종을 비활성화하시겠습니까?')) return;
    await handleSave(false);
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isBulk ? `가격 추종 일괄 설정 (${monitorIds?.length ?? 0}개)` : '가격 추종 설정'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        {!isBulk && monitor && (
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700">
            <div className="font-medium truncate mb-1">{monitor.productName}</div>
            <div className="flex gap-4 text-[11px] text-gray-500">
              <span>소스가: {sourcePrice ? `₩${sourcePrice.toLocaleString()}` : '-'}</span>
              <span>우리가: {ourPrice ? `₩${ourPrice.toLocaleString()}` : '-'}</span>
            </div>
          </div>
        )}

        {/* 활성 토글 */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
            className="w-4 h-4 accent-[#E31837]"
          />
          <div>
            <div className="text-sm font-medium text-gray-900">가격 추종 활성화</div>
            <div className="text-xs text-gray-500">소스 가격 변동 시 자동으로 우리 가격을 조정합니다</div>
          </div>
        </label>

        {/* 모드 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">업데이트 모드</label>
          <div className="grid grid-cols-2 gap-2">
            {(['manual_approval', 'auto'] as PriceFollowMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setRule({ ...rule, mode: m }); if (m !== 'auto') setAutoConfirm(false); }}
                className={`px-4 py-2.5 text-sm rounded-lg border transition text-left ${
                  rule.mode === m
                    ? 'border-[#E31837] bg-red-50 text-gray-900'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">{m === 'manual_approval' ? '수동 승인' : '자동 반영'}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {m === 'manual_approval' ? '변동 감지 시 승인 대기열에 추가' : '즉시 쿠팡에 반영 (주의!)'}
                </div>
              </button>
            ))}
          </div>
          {rule.mode === 'auto' && (
            <label className="flex items-start gap-2 mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-xs text-yellow-900 font-medium">자동 반영 모드 경고</div>
                <div className="text-[11px] text-yellow-700 mt-0.5">
                  크론 사이클에서 감지된 가격 변동이 사람 확인 없이 쿠팡에 즉시 적용됩니다. min/max 가드레일을 반드시 설정하세요.
                </div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoConfirm}
                    onChange={(e) => setAutoConfirm(e.target.checked)}
                    className="w-3.5 h-3.5 accent-yellow-600"
                  />
                  <span className="text-[11px] text-yellow-800">이해했으며 자동 반영을 허용합니다</span>
                </label>
              </div>
            </label>
          )}
        </div>

        {/* 규칙 타입 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">규칙 타입</label>
          <select
            value={rule.type}
            onChange={(e) => setRule({ ...rule, type: e.target.value as PriceFollowType })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
          >
            <option value="exact">정가 추종 (소스가 그대로)</option>
            <option value="markup_amount">원 단위 마크업 (+N원)</option>
            <option value="markup_percent">퍼센트 마크업 (+N%)</option>
            <option value="fixed_margin">마진 고정 (첫 활성화 시 캡처)</option>
          </select>
        </div>

        {/* 타입별 입력 */}
        {rule.type === 'markup_amount' && (
          <NumberInput
            label="마크업 금액"
            value={rule.amount ?? 0}
            onChange={(v) => setRule({ ...rule, amount: v })}
            suffix="원"
          />
        )}
        {rule.type === 'markup_percent' && (
          <NumberInput
            label="마크업 비율"
            value={rule.percent ?? 0}
            onChange={(v) => setRule({ ...rule, percent: v })}
            suffix="%"
          />
        )}
        {rule.type === 'fixed_margin' && (
          <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg p-3">
            첫 가격 추종 실행 시 <strong>현재 우리가 − 소스가</strong>를 마진으로 자동 캡처합니다. 이후 소스가 변동 시 캡처된 마진만큼 더해서 우리가를 조정합니다.
            {rule.captured_margin != null && (
              <div className="mt-2 text-blue-700 font-medium">
                캡처된 마진: ₩{rule.captured_margin.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* 프리뷰 (단일 모드만) */}
        {!isBulk && preview != null && ourPrice > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">미리보기</div>
            <div className="text-sm text-gray-900 font-mono">
              ₩{ourPrice.toLocaleString()} → ₩{preview.toLocaleString()}
              {previewDelta && previewDelta.diff !== 0 && (
                <span className={`ml-2 text-xs ${previewDelta.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ({previewDelta.diff > 0 ? '+' : ''}{previewDelta.diff.toLocaleString()}원 / {previewDelta.pct > 0 ? '+' : ''}{previewDelta.pct.toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
        )}

        {/* 고급 옵션 */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {showAdvanced ? '고급 옵션 숨기기 ▲' : '고급 옵션 보기 ▼'}
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
              <NumberInput
                label="최소 가격 (하한 가드레일)"
                value={rule.min_price ?? 0}
                onChange={(v) => setRule({ ...rule, min_price: v || undefined })}
                placeholder="미설정"
                suffix="원"
              />
              <NumberInput
                label="최대 가격 (상한 가드레일)"
                value={rule.max_price ?? 0}
                onChange={(v) => setRule({ ...rule, max_price: v || undefined })}
                placeholder="미설정"
                suffix="원"
              />
              <NumberInput
                label="최소 변동폭 (이하 무시)"
                value={rule.min_change_pct ?? 1}
                onChange={(v) => setRule({ ...rule, min_change_pct: v })}
                suffix="%"
              />
              <NumberInput
                label="최대 변동폭 (이상 플래그)"
                value={rule.max_change_pct ?? 30}
                onChange={(v) => setRule({ ...rule, max_change_pct: v })}
                suffix="%"
              />
              <NumberInput
                label="쿨다운 (플래핑 방지)"
                value={rule.cooldown_minutes ?? 60}
                onChange={(v) => setRule({ ...rule, cooldown_minutes: v })}
                suffix="분"
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rule.follow_down !== false}
                  onChange={(e) => setRule({ ...rule, follow_down: e.target.checked })}
                  className="w-4 h-4 accent-[#E31837]"
                />
                <span className="text-sm text-gray-700">가격 하락 시에도 추종</span>
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            {!isBulk && monitor?.price_follow_rule?.enabled && (
              <button
                type="button"
                onClick={handleDisable}
                disabled={saving}
                className="px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
              >
                비활성화
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving || needsAutoConfirm}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              저장
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
