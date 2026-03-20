'use client';

import { useState, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, FileText, Hash, Tag, Truck,
  Settings2, Loader2, AlertTriangle,
} from 'lucide-react';
import type { PayloadPreviewData } from './PayloadPreviewPanel';
import type { EditableProduct } from './types';

interface CoupangFieldsSectionProps {
  product: EditableProduct;
  previewData: PayloadPreviewData | null;
  previewLoading: boolean;
  previewError: string;
  onUpdate: (uid: string, field: string, value: string | number | Record<string, string>) => void;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}

function CollapsibleSection({ title, icon, defaultOpen = false, badge, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {badge && <span className="text-[10px] text-gray-400 font-normal">{badge}</span>}
      </button>
      {open && <div className="px-3 pb-3 space-y-2 border-t border-gray-100">{children}</div>}
    </div>
  );
}

export default function CoupangFieldsSection({
  product,
  previewData,
  previewLoading,
  previewError,
  onUpdate,
}: CoupangFieldsSectionProps) {
  const meta = previewData?.meta;
  const payload = previewData?.payload as Record<string, unknown> | undefined;

  const handleNoticeChange = useCallback((fieldName: string, content: string) => {
    const current = product.editedNoticeValues || {};
    onUpdate(product.uid, 'editedNoticeValues', { ...current, [fieldName]: content });
  }, [product.uid, product.editedNoticeValues, onUpdate]);

  const handleAttributeChange = useCallback((attrName: string, value: string) => {
    const current = product.editedAttributeValues || {};
    onUpdate(product.uid, 'editedAttributeValues', { ...current, [attrName]: value });
  }, [product.uid, product.editedAttributeValues, onUpdate]);

  if (previewLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <span className="text-xs">카테고리 메타 로딩 중...</span>
      </div>
    );
  }

  if (previewError) {
    return (
      <div className="flex items-center gap-2 py-4 px-3 bg-orange-50 rounded-lg text-xs text-orange-600">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>{previewError}</span>
      </div>
    );
  }

  if (!previewData) {
    return (
      <div className="text-xs text-gray-400 py-4 text-center">
        카테고리를 선택하면 쿠팡 API 필드가 표시됩니다.
      </div>
    );
  }

  const items = (payload?.sellerProductItemList as Record<string, unknown>[] | undefined) || [];
  const firstItem = items[0] as Record<string, unknown> | undefined;

  return (
    <div className="space-y-2">
      {/* 노출상품명 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">노출상품명 (쿠팡 검색노출)</label>
        <input
          type="text"
          value={product.editedDisplayProductName ?? (payload?.displayProductName as string || '')}
          onChange={(e) => onUpdate(product.uid, 'editedDisplayProductName', e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none"
          placeholder="노출상품명 (비워두면 자동 생성)"
        />
        <p className="text-[10px] text-gray-400 mt-0.5">
          {(product.editedDisplayProductName ?? (payload?.displayProductName as string || '')).length}자
        </p>
      </div>

      {/* 제조사 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">제조사</label>
        <input
          type="text"
          value={product.editedManufacturer ?? ''}
          onChange={(e) => onUpdate(product.uid, 'editedManufacturer', e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none"
          placeholder="비워두면 브랜드와 동일"
        />
      </div>

      {/* 가격 추가 필드 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">정가 (할인 표시용)</label>
          <input
            type="number"
            value={product.editedOriginalPrice ?? ''}
            onChange={(e) => onUpdate(product.uid, 'editedOriginalPrice', Number(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right tabular-nums focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none"
            placeholder="판매가보다 높으면 할인태그"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">재고</label>
          <input
            type="number"
            value={product.editedStock ?? 999}
            onChange={(e) => onUpdate(product.uid, 'editedStock', Number(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right tabular-nums focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none"
          />
        </div>
      </div>

      {/* 옵션 추출 결과 */}
      <CollapsibleSection
        title="옵션 추출 결과"
        icon={<Tag className="w-3.5 h-3.5 text-blue-500" />}
        defaultOpen={true}
        badge={meta?.extractedOptions.length ? `${meta.extractedOptions.length}개` : undefined}
      >
        {meta && meta.extractedOptions.length > 0 ? (
          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap gap-2">
              {meta.extractedOptions.map((opt, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs">
                  <span className="text-gray-500">{opt.name}:</span>
                  <span className="font-medium text-gray-800">{opt.value}{opt.unit || ''}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-[10px] text-gray-500">
              <span>신뢰도: <strong className={meta.optionConfidence >= 80 ? 'text-green-600' : meta.optionConfidence >= 50 ? 'text-yellow-600' : 'text-gray-400'}>{meta.optionConfidence}%</strong></span>
              {meta.totalUnitCount !== undefined && (
                <span>unitCount: <strong className="text-gray-700">{meta.totalUnitCount}</strong></span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-gray-400 mb-0.5">아이템명</label>
                <input
                  type="text"
                  value={product.editedItemName ?? (firstItem?.itemName as string || '')}
                  onChange={(e) => onUpdate(product.uid, 'editedItemName', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-[#E31837] outline-none"
                  placeholder="자동 생성"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-0.5">단위수량 (unitCount)</label>
                <input
                  type="number"
                  value={product.editedUnitCount ?? meta.totalUnitCount ?? 1}
                  onChange={(e) => onUpdate(product.uid, 'editedUnitCount', Number(e.target.value) || 1)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-right tabular-nums focus:ring-1 focus:ring-[#E31837] outline-none"
                />
              </div>
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-400 pt-2 block">추출된 옵션 없음</span>
        )}
      </CollapsibleSection>

      {/* 고시정보 */}
      <CollapsibleSection
        title="고시정보"
        icon={<FileText className="w-3.5 h-3.5 text-purple-500" />}
        badge={meta?.noticeCategories.length ? `${meta.noticeCategories.reduce((s, c) => s + c.fieldCount, 0)}개 필드` : undefined}
      >
        {meta && meta.noticeCategories.length > 0 ? (
          <div className="space-y-3 pt-2">
            {meta.noticeCategories.map((nc, ci) => (
              <div key={ci}>
                <div className="text-[11px] font-medium text-gray-600 mb-1.5">{nc.name}</div>
                <div className="space-y-1.5">
                  {nc.fields.map((f, fi) => {
                    const key = `${nc.name}::${f.noticeCategoryDetailName}`;
                    const editedValue = product.editedNoticeValues?.[key];
                    return (
                      <div key={fi} className="flex items-start gap-2">
                        <label className="text-[10px] text-gray-500 w-28 shrink-0 pt-1.5 truncate" title={f.noticeCategoryDetailName}>
                          {f.noticeCategoryDetailName}
                        </label>
                        <input
                          type="text"
                          value={editedValue ?? f.content}
                          onChange={(e) => handleNoticeChange(key, e.target.value)}
                          className={`flex-1 px-2 py-1 border rounded text-xs focus:ring-1 focus:ring-[#E31837] outline-none ${
                            editedValue !== undefined && editedValue !== f.content
                              ? 'border-[#E31837] bg-red-50/30'
                              : 'border-gray-200'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gray-400 pt-2 block">고시정보 없음</span>
        )}
      </CollapsibleSection>

      {/* 속성 */}
      <CollapsibleSection
        title="속성"
        icon={<Hash className="w-3.5 h-3.5 text-teal-500" />}
        badge={meta?.attributes.length ? `${meta.attributes.length}개` : undefined}
      >
        {meta && meta.attributes.length > 0 ? (
          <div className="space-y-1.5 pt-2">
            {meta.attributes.map((attr, i) => {
              const editedValue = product.editedAttributeValues?.[attr.name];
              return (
                <div key={i} className="flex items-center gap-2">
                  <label className={`text-[10px] w-28 shrink-0 truncate ${attr.required ? 'text-red-600 font-medium' : 'text-gray-500'}`} title={attr.name}>
                    {attr.name}{attr.required && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    type="text"
                    value={editedValue ?? ''}
                    onChange={(e) => handleAttributeChange(attr.name, e.target.value)}
                    className={`flex-1 px-2 py-1 border rounded text-xs focus:ring-1 focus:ring-[#E31837] outline-none ${
                      editedValue ? 'border-[#E31837] bg-red-50/30' : 'border-gray-200'
                    }`}
                    placeholder={attr.dataType === 'NUMBER' ? '숫자' : '값 입력'}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <span className="text-xs text-gray-400 pt-2 block">속성 없음</span>
        )}
      </CollapsibleSection>

      {/* 배송/반품 (읽기전용) */}
      <CollapsibleSection
        title="배송 정보"
        icon={<Truck className="w-3.5 h-3.5 text-green-500" />}
      >
        <div className="pt-2 space-y-1.5">
          {payload ? (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 w-24">배송비:</span>
                <span className="text-gray-800 font-medium">
                  {payload.deliveryChargeType === 'FREE' ? '무료배송' :
                   payload.deliveryChargeType === 'CONDITIONAL_FREE' ? '조건부 무료' : '유료배송'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 w-24">출고소요일:</span>
                <input
                  type="number"
                  value={product.editedShippingDays ?? 2}
                  onChange={(e) => onUpdate(product.uid, 'editedShippingDays', Number(e.target.value) || 1)}
                  className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-right tabular-nums focus:ring-1 focus:ring-[#E31837] outline-none"
                  min={1}
                  max={20}
                />
                <span className="text-[10px] text-gray-400">일</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 w-24">인당 최대구매:</span>
                <input
                  type="number"
                  value={product.editedMaxBuyPerPerson ?? 0}
                  onChange={(e) => onUpdate(product.uid, 'editedMaxBuyPerPerson', Number(e.target.value) || 0)}
                  className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-right tabular-nums focus:ring-1 focus:ring-[#E31837] outline-none"
                  min={0}
                />
                <span className="text-[10px] text-gray-400">0 = 제한없음</span>
              </div>
            </>
          ) : (
            <span className="text-xs text-gray-400">배송 정보를 Step 1에서 설정합니다.</span>
          )}
        </div>
      </CollapsibleSection>

      {/* 기타 설정 */}
      <CollapsibleSection
        title="기타 설정"
        icon={<Settings2 className="w-3.5 h-3.5 text-gray-500" />}
      >
        <div className="pt-2 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-24">세금유형:</label>
            <select
              value={product.editedTaxType ?? 'TAX'}
              onChange={(e) => onUpdate(product.uid, 'editedTaxType', e.target.value)}
              className="px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-[#E31837] outline-none"
            >
              <option value="TAX">과세</option>
              <option value="FREE">면세</option>
              <option value="ZERO">영세</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-24">성인전용:</label>
            <select
              value={product.editedAdultOnly ?? 'EVERYONE'}
              onChange={(e) => onUpdate(product.uid, 'editedAdultOnly', e.target.value)}
              className="px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-[#E31837] outline-none"
            >
              <option value="EVERYONE">전체</option>
              <option value="ADULT_ONLY">성인전용</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-24">바코드:</label>
            <input
              type="text"
              value={product.editedBarcode ?? ''}
              onChange={(e) => onUpdate(product.uid, 'editedBarcode', e.target.value)}
              className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-[#E31837] outline-none"
              placeholder="선택사항"
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
