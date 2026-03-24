'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, FileText, Hash, Tag, Truck,
  Settings2, Loader2, AlertTriangle, Package, Image as ImageIcon,
  DollarSign, Layers, CheckCircle2, Settings, Shuffle, Eye,
} from 'lucide-react';
import BulkImageGrid from './BulkImageGrid';
import { shuffleWithSeed, type PreventionConfig } from '@/lib/megaload/services/item-winner-prevention';
import type { PayloadPreviewData } from './PayloadPreviewPanel';
import type { EditableProduct } from './types';

interface ImageItem {
  id: string;
  url: string;
}

interface CoupangFieldsSectionProps {
  product: EditableProduct;
  previewData: PayloadPreviewData | null;
  previewLoading: boolean;
  previewError: string;
  onUpdate: (uid: string, field: string, value: string | number | string[] | Record<string, string>) => void;
  onCategoryClick: (uid: string) => void;
  imageItems: ImageItem[];
  onImageReorder: (newOrder: ImageItem[]) => void;
  onImageRemove: (id: string) => void;
  preventionConfig?: PreventionConfig;
}

/* ─── Required field input styling ─── */
const inputBase = 'w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none';
const inputNormal = `${inputBase} border-gray-200`;
const inputRequired = (isEmpty: boolean) =>
  isEmpty
    ? `${inputBase} border-red-300 bg-red-50`
    : `${inputBase} border-gray-200`;

const selectBase = 'px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none';

function RequiredLabel({ children, empty }: { children: React.ReactNode; empty?: boolean }) {
  return (
    <label className={`block text-xs font-medium mb-1 ${empty ? 'text-red-600' : 'text-gray-500'}`}>
      {children}<span className="text-red-500 ml-0.5">*</span>
    </label>
  );
}

function OptionalLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-500 mb-1">{children}</label>;
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <OptionalLabel>{label}</OptionalLabel>
      <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700">{value || '-'}</div>
    </div>
  );
}

function Step1Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 w-28 shrink-0">{label}</span>
      <span className="flex-1 px-2 py-1.5 bg-gray-100 rounded text-gray-500 text-xs">
        {value || <span className="inline-flex items-center gap-1"><Settings className="w-3 h-3" /> Step 1에서 설정</span>}
      </span>
    </div>
  );
}

/* ─── CollapsibleSection ─── */
interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
  missingCount?: number;
  allComplete?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title, icon, defaultOpen = false, badge, missingCount, allComplete, children,
}: CollapsibleSectionProps) {
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
        {missingCount !== undefined && missingCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">{missingCount}개 미입력</span>
        )}
        {allComplete && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
        {badge && <span className="text-[10px] text-gray-400 font-normal">{badge}</span>}
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5 border-t border-gray-100 pt-2.5">{children}</div>}
    </div>
  );
}

/* ─── Image Section with Prevention Preview ─── */
function ImageSectionWithPreview({
  imageItems, onImageReorder, onImageRemove, preventionConfig, productCode,
}: {
  imageItems: ImageItem[];
  onImageReorder: (newOrder: ImageItem[]) => void;
  onImageRemove: (id: string) => void;
  preventionConfig?: PreventionConfig;
  productCode: string;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const isShuffleEnabled = preventionConfig?.enabled && preventionConfig?.imageOrderShuffle;

  // 셀러 A/B/C 시드로 각각 다른 셔플 결과 미리보기
  const previewSeeds = useMemo(() => ['셀러A', '셀러B', '셀러C'], []);

  // 전체 셔플 (대표이미지 포함) — 셀러마다 다른 이미지가 대표로 설정됨
  const shuffledPreviews = useMemo(() => {
    if (imageItems.length <= 1) return [];
    if (!isShuffleEnabled) {
      // 방지 비활성 시: 현재 순서 그대로 업로드 (1개 예시만)
      return [{ sellerLabel: '업로드 순서', images: [...imageItems] }];
    }
    return previewSeeds.map(sellerLabel => {
      const seed = `${sellerLabel}:${productCode}`;
      const shuffled = shuffleWithSeed(imageItems, seed);
      return { sellerLabel, images: shuffled };
    });
  }, [isShuffleEnabled, imageItems, productCode, previewSeeds]);

  return (
    <CollapsibleSection
      title="대표 이미지"
      icon={<ImageIcon className="w-3.5 h-3.5 text-pink-500" />}
      defaultOpen={true}
      badge={`${imageItems.length}장 / 최대 10장`}
      missingCount={imageItems.length === 0 ? 1 : undefined}
      allComplete={imageItems.length > 0}
    >
      {imageItems.length > 0 ? (
        <>
          <BulkImageGrid
            images={imageItems}
            onReorder={onImageReorder}
            onRemove={onImageRemove}
            onSetAsMain={(id) => {
              const idx = imageItems.findIndex(i => i.id === id);
              if (idx <= 0) return;
              const newOrder = [imageItems[idx], ...imageItems.filter((_, i) => i !== idx)];
              onImageReorder(newOrder);
            }}
          />

          {/* 업로드 순서 미리보기 — 항상 표시 */}
          {imageItems.length > 1 && (
            <div className="mt-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition ${
                  showPreview
                    ? isShuffleEnabled ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isShuffleEnabled ? <Shuffle className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {isShuffleEnabled ? '위너 방지 업로드 미리보기' : '업로드 순서 미리보기'}
              </button>

              {showPreview && (
                <div className={`mt-2 space-y-3 p-3 rounded-lg border ${
                  isShuffleEnabled ? 'bg-purple-50/50 border-purple-200' : 'bg-blue-50/50 border-blue-200'
                }`}>
                  <div className={`text-[10px] font-medium ${isShuffleEnabled ? 'text-purple-600' : 'text-blue-600'}`}>
                    {isShuffleEnabled
                      ? '셀러마다 대표이미지 + 순서가 모두 다르게 등록됩니다'
                      : '현재 순서대로 쿠팡에 업로드됩니다 (1번 = 대표이미지)'}
                  </div>
                  {shuffledPreviews.map(({ sellerLabel, images }) => (
                    <div key={sellerLabel}>
                      <div className="text-[10px] text-gray-500 mb-1 font-medium">{sellerLabel}</div>
                      <div className="flex gap-1 overflow-x-auto pb-1">
                        {images.map((img, idx) => (
                          <div
                            key={img.id}
                            className={`relative shrink-0 w-12 h-12 rounded overflow-hidden border ${
                              idx === 0 ? 'border-amber-400 ring-1 ring-amber-300' : 'border-gray-200'
                            }`}
                          >
                            <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                            {idx === 0 && (
                              <div className="absolute bottom-0 left-0 right-0 bg-amber-500 text-white text-[7px] text-center font-bold leading-tight py-px">
                                대표
                              </div>
                            )}
                            <div className="absolute top-0 right-0 bg-black/50 text-white text-[7px] px-0.5 rounded-bl">
                              {idx + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {isShuffleEnabled ? (
                    <div className="text-[9px] text-gray-400">
                      * 실제 등록 시 셀러 ID 기반 시드로 결정되며, 위 예시는 시뮬레이션입니다.
                    </div>
                  ) : (
                    <div className="text-[9px] text-amber-600">
                      * 위너 방지를 활성화하면 셀러마다 다른 대표이미지로 등록됩니다.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-400 py-2">이미지가 없습니다.</p>
      )}
    </CollapsibleSection>
  );
}

/* ─── Main Component ─── */
export default function CoupangFieldsSection({
  product,
  previewData,
  previewLoading,
  previewError,
  onUpdate,
  onCategoryClick,
  imageItems,
  onImageReorder,
  onImageRemove,
  preventionConfig,
}: CoupangFieldsSectionProps) {
  const meta = previewData?.meta;
  const payload = previewData?.payload as Record<string, unknown> | undefined;
  const items = (payload?.sellerProductItemList as Record<string, unknown>[] | undefined) || [];
  const firstItem = items[0] as Record<string, unknown> | undefined;

  const handleNoticeChange = useCallback((fieldName: string, content: string) => {
    const current = product.editedNoticeValues || {};
    onUpdate(product.uid, 'editedNoticeValues', { ...current, [fieldName]: content });
  }, [product.uid, product.editedNoticeValues, onUpdate]);

  const handleAttributeChange = useCallback((attrName: string, value: string) => {
    const current = product.editedAttributeValues || {};
    onUpdate(product.uid, 'editedAttributeValues', { ...current, [attrName]: value });
  }, [product.uid, product.editedAttributeValues, onUpdate]);

  // ─── Required field missing counts ───
  const basicMissing = useMemo(() => {
    let count = 0;
    if (!product.editedName) count++;
    if (!(product.editedDisplayProductName ?? '')) count++;
    if (!product.editedBrand) count++;
    return count;
  }, [product.editedName, product.editedDisplayProductName, product.editedBrand]);

  const categoryMissing = product.editedCategoryCode ? 0 : 1;

  const priceMissing = product.editedSellingPrice > 0 ? 0 : 1;

  const optionMissing = useMemo(() => {
    let count = 0;
    const itemName = product.editedItemName ?? (firstItem?.itemName as string) ?? product.editedName;
    if (!itemName) count++;
    return count;
  }, [product.editedItemName, firstItem]);

  const noticeMissing = useMemo(() => {
    if (!meta) return 0;
    let count = 0;
    for (const nc of meta.noticeCategories) {
      for (const f of nc.fields) {
        const key = `${nc.name}::${f.noticeCategoryDetailName}`;
        const val = product.editedNoticeValues?.[key] ?? f.content;
        if (!val) count++;
      }
    }
    return count;
  }, [meta, product.editedNoticeValues]);

  const attrMissing = useMemo(() => {
    if (!meta) return 0;
    let count = 0;
    for (const attr of meta.attributes) {
      if (attr.required) {
        const val = product.editedAttributeValues?.[attr.name];
        if (!val) count++;
      }
    }
    return count;
  }, [meta, product.editedAttributeValues]);

  return (
    <div className="space-y-2.5">

      {/* ❶ 기본정보 */}
      <CollapsibleSection
        title="기본정보"
        icon={<Package className="w-3.5 h-3.5 text-blue-500" />}
        defaultOpen={true}
        missingCount={basicMissing}
        allComplete={basicMissing === 0}
      >
        {/* 판매자상품명 */}
        <div className={!product.editedName ? 'border-l-2 border-l-red-400 pl-3' : ''}>
          <RequiredLabel empty={!product.editedName}>판매자상품명 (sellerProductName)</RequiredLabel>
          <input
            type="text"
            value={product.editedName}
            onChange={(e) => onUpdate(product.uid, 'editedName', e.target.value)}
            className={inputRequired(!product.editedName)}
            placeholder="판매자상품명 입력"
          />
          <p className="text-[10px] text-gray-400 mt-0.5">{product.editedName.length}자</p>
        </div>

        {/* 노출상품명 */}
        {(() => {
          const dpn = product.editedDisplayProductName ?? '';
          const isEmpty = !dpn;
          // 카테고리 있는데 노출상품명 없으면 → 자동 생성 대기 중
          const isGenerating = isEmpty && !!product.editedCategoryCode;
          return (
            <div className={isEmpty ? (isGenerating ? 'border-l-2 border-l-purple-400 pl-3' : 'border-l-2 border-l-red-400 pl-3') : ''}>
              <RequiredLabel empty={isEmpty && !isGenerating}>노출상품명 (displayProductName)</RequiredLabel>
              <div className="relative">
                <input
                  type="text"
                  value={dpn}
                  onChange={(e) => onUpdate(product.uid, 'editedDisplayProductName', e.target.value)}
                  className={isGenerating
                    ? 'w-full px-3 py-2 border border-purple-300 bg-purple-50 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition'
                    : inputRequired(isEmpty)}
                  placeholder={isGenerating ? '자동 생성 중...' : '노출상품명 입력'}
                />
                {isGenerating && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-purple-500" />
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {isGenerating ? '카테고리 매칭 완료 후 자동 생성됩니다' : `${dpn.length}자`}
              </p>
            </div>
          );
        })()}

        {/* 브랜드 */}
        <div className={!product.editedBrand ? 'border-l-2 border-l-red-400 pl-3' : ''}>
          <RequiredLabel empty={!product.editedBrand}>브랜드</RequiredLabel>
          <input
            type="text"
            value={product.editedBrand}
            onChange={(e) => onUpdate(product.uid, 'editedBrand', e.target.value)}
            className={inputRequired(!product.editedBrand)}
            placeholder="브랜드 입력"
          />
        </div>

        {/* 제조사 */}
        <div>
          <OptionalLabel>제조사</OptionalLabel>
          <input
            type="text"
            value={product.editedManufacturer ?? ''}
            onChange={(e) => onUpdate(product.uid, 'editedManufacturer', e.target.value)}
            className={inputNormal}
            placeholder="비워두면 브랜드와 동일"
          />
        </div>

        {/* 상품군 (읽기전용 — 노출상품명에서 자동 파생) */}
        <ReadonlyField label="상품군 (generalProductName)" value={(product.editedDisplayProductName || product.name || product.editedName).slice(0, 100)} />
      </CollapsibleSection>

      {/* ❷ 카테고리 */}
      <CollapsibleSection
        title="카테고리"
        icon={<Layers className="w-3.5 h-3.5 text-indigo-500" />}
        defaultOpen={true}
        missingCount={categoryMissing}
        allComplete={categoryMissing === 0}
      >
        <div className={!product.editedCategoryCode ? 'border-l-2 border-l-red-400 pl-3' : ''}>
          <RequiredLabel empty={!product.editedCategoryCode}>카테고리코드</RequiredLabel>
          <button
            onClick={() => onCategoryClick(product.uid)}
            className={`w-full text-left px-3 py-2 border rounded-lg text-sm transition flex items-center gap-2 ${
              product.editedCategoryCode
                ? 'border-gray-200 hover:border-[#E31837]'
                : 'border-red-300 bg-red-50 hover:border-red-400'
            }`}
          >
            {product.editedCategoryCode ? (
              <>
                <span className="font-mono text-xs text-gray-500">{product.editedCategoryCode}</span>
                <span className="flex-1 text-gray-900">{product.editedCategoryName}</span>
              </>
            ) : (
              <span className="text-gray-400">카테고리를 선택해주세요</span>
            )}
          </button>
        </div>

        {product.editedCategoryCode && (
          <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
            {product.categoryConfidence > 0 && (
              <span className="inline-flex items-center gap-1">
                매칭 신뢰도:
                <span className={`font-medium ${
                  product.categoryConfidence >= 0.8 ? 'text-green-600' :
                  product.categoryConfidence >= 0.5 ? 'text-yellow-600' : 'text-gray-400'
                }`}>
                  {Math.round(product.categoryConfidence * 100)}%
                </span>
              </span>
            )}
            {product.categorySource && (
              <span>소스: <span className="text-gray-700">{product.categorySource}</span></span>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* ❸ 가격/재고 */}
      <CollapsibleSection
        title="가격/재고"
        icon={<DollarSign className="w-3.5 h-3.5 text-green-500" />}
        defaultOpen={true}
        missingCount={priceMissing}
        allComplete={priceMissing === 0}
      >
        {/* 원가 (도매가) — 읽기전용 */}
        <ReadonlyField label="원가 (도매가)" value={`${product.sourcePrice.toLocaleString()}원`} />

        {/* 판매가 */}
        <div className={product.editedSellingPrice <= 0 ? 'border-l-2 border-l-red-400 pl-3' : ''}>
          <RequiredLabel empty={product.editedSellingPrice <= 0}>판매가 (salePrice)</RequiredLabel>
          <input
            type="number"
            value={product.editedSellingPrice}
            onChange={(e) => onUpdate(product.uid, 'editedSellingPrice', Number(e.target.value))}
            className={`${inputRequired(product.editedSellingPrice <= 0)} text-right tabular-nums text-[#E31837] font-medium`}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* 정가 (할인태그용) */}
          <div>
            <OptionalLabel>정가 (할인태그용)</OptionalLabel>
            <input
              type="number"
              value={product.editedOriginalPrice ?? ''}
              onChange={(e) => onUpdate(product.uid, 'editedOriginalPrice', Number(e.target.value) || 0)}
              className={`${inputNormal} text-right tabular-nums`}
              placeholder="0"
            />
          </div>

          {/* 재고 */}
          <div>
            <OptionalLabel>재고 (maximumBuyCount)</OptionalLabel>
            <input
              type="number"
              value={product.editedStock ?? 999}
              onChange={(e) => onUpdate(product.uid, 'editedStock', Number(e.target.value) || 0)}
              className={`${inputNormal} text-right tabular-nums`}
            />
          </div>

          {/* 인당 최대구매 */}
          <div>
            <OptionalLabel>인당 최대구매</OptionalLabel>
            <input
              type="number"
              value={product.editedMaxBuyPerPerson ?? 0}
              onChange={(e) => onUpdate(product.uid, 'editedMaxBuyPerPerson', Number(e.target.value) || 0)}
              className={`${inputNormal} text-right tabular-nums`}
              min={0}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">0 = 무제한</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* ❹ 이미지 */}
      <ImageSectionWithPreview
        imageItems={imageItems}
        onImageReorder={onImageReorder}
        onImageRemove={onImageRemove}
        preventionConfig={preventionConfig}
        productCode={product.productCode}
      />

      {/* ❺ 옵션/아이템 */}
      <CollapsibleSection
        title="옵션/아이템"
        icon={<Tag className="w-3.5 h-3.5 text-blue-500" />}
        defaultOpen={true}
        missingCount={optionMissing}
        allComplete={optionMissing === 0}
        badge={meta?.extractedOptions.length ? `${meta.extractedOptions.length}개 추출` : undefined}
      >
        {/* 아이템명 */}
        <div className={!(product.editedItemName ?? (firstItem?.itemName as string) ?? product.editedName) ? 'border-l-2 border-l-red-400 pl-3' : ''}>
          <RequiredLabel empty={!(product.editedItemName ?? (firstItem?.itemName as string) ?? product.editedName)}>아이템명 (itemName)</RequiredLabel>
          <input
            type="text"
            value={product.editedItemName ?? (firstItem?.itemName as string) ?? product.editedName}
            onChange={(e) => onUpdate(product.uid, 'editedItemName', e.target.value)}
            className={inputRequired(!(product.editedItemName ?? (firstItem?.itemName as string) ?? product.editedName))}
            placeholder="자동 생성"
          />
        </div>

        {/* 단위수량 */}
        <div>
          <RequiredLabel>단위수량 (unitCount)</RequiredLabel>
          <input
            type="number"
            value={product.editedUnitCount ?? meta?.totalUnitCount ?? 1}
            onChange={(e) => onUpdate(product.uid, 'editedUnitCount', Number(e.target.value) || 1)}
            className={`${inputNormal} text-right tabular-nums`}
            min={1}
          />
        </div>

        {/* 추출된 옵션 태그 */}
        {meta && meta.extractedOptions.length > 0 && (
          <div className="mt-2">
            <OptionalLabel>추출된 옵션 태그</OptionalLabel>
            <div className="flex flex-wrap gap-1.5">
              {meta.extractedOptions.map((opt, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs">
                  <span className="text-gray-500">{opt.name}:</span>
                  <span className="font-medium text-gray-800">{opt.value}{opt.unit || ''}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-[10px] text-gray-500 mt-1.5">
              <span>
                신뢰도: <strong className={meta.optionConfidence >= 80 ? 'text-green-600' : meta.optionConfidence >= 50 ? 'text-yellow-600' : 'text-gray-400'}>{meta.optionConfidence}%</strong>
              </span>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* ❻ 배송/반품 */}
      <CollapsibleSection
        title="배송/반품"
        icon={<Truck className="w-3.5 h-3.5 text-green-600" />}
      >
        <div className="space-y-2">
          {payload ? (
            <>
              <Step1Field
                label="배송비 유형"
                value={
                  payload.deliveryChargeType === 'FREE' ? '무료배송' :
                  payload.deliveryChargeType === 'CONDITIONAL_FREE' ? '조건부 무료' : '유료배송'
                }
              />
              <Step1Field
                label="배송사"
                value={payload.deliveryCompanyCode as string || undefined}
              />
            </>
          ) : (
            <>
              <Step1Field label="배송비 유형" />
              <Step1Field label="배송사" />
            </>
          )}

          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 w-28 shrink-0">출고소요일</span>
            <input
              type="number"
              value={product.editedShippingDays ?? 2}
              onChange={(e) => onUpdate(product.uid, 'editedShippingDays', Number(e.target.value) || 1)}
              className="w-20 px-2 py-1.5 border border-gray-200 rounded text-xs text-right tabular-nums focus:ring-1 focus:ring-[#E31837] outline-none"
              min={1}
              max={20}
            />
            <span className="text-[10px] text-gray-400">일</span>
          </div>

          {payload ? (
            <>
              <Step1Field
                label="반품비"
                value={payload.returnCharge !== undefined ? `${Number(payload.returnCharge).toLocaleString()}원` : undefined}
              />
              <Step1Field
                label="반품지/AS"
                value={payload.afterServiceInformation as string || undefined}
              />
            </>
          ) : (
            <>
              <Step1Field label="반품비" />
              <Step1Field label="반품지/AS" />
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* ❼ 고시정보 */}
      <CollapsibleSection
        title="고시정보"
        icon={<FileText className="w-3.5 h-3.5 text-purple-500" />}
        badge={meta?.noticeCategories.length ? `${meta.noticeCategories.reduce((s, c) => s + c.fieldCount, 0)}개 필드` : undefined}
        missingCount={noticeMissing > 0 ? noticeMissing : undefined}
        allComplete={meta !== undefined && noticeMissing === 0}
      >
        {previewLoading ? (
          <div className="flex items-center gap-2 py-3 text-gray-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>카테고리 메타 로딩 중...</span>
          </div>
        ) : previewError ? (
          <div className="flex items-center gap-2 py-2 text-orange-600 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{previewError}</span>
          </div>
        ) : !meta ? (
          <p className="text-xs text-gray-400 py-2">카테고리를 먼저 선택하세요</p>
        ) : meta.noticeCategories.length > 0 ? (
          <div className="space-y-3">
            {meta.noticeCategories.map((nc, ci) => (
              <div key={ci}>
                <div className="text-[11px] font-medium text-gray-600 mb-1.5">{nc.name}</div>
                <div className="space-y-1.5">
                  {nc.fields.map((f, fi) => {
                    const key = `${nc.name}::${f.noticeCategoryDetailName}`;
                    const editedValue = product.editedNoticeValues?.[key];
                    const val = editedValue ?? f.content;
                    const isEmpty = !val;
                    return (
                      <div key={fi} className={`flex items-start gap-2 ${isEmpty ? 'border-l-2 border-l-red-400 pl-2' : ''}`}>
                        <label className={`text-[10px] w-28 shrink-0 pt-1.5 truncate ${isEmpty ? 'text-red-600 font-medium' : 'text-gray-500'}`} title={f.noticeCategoryDetailName}>
                          {f.noticeCategoryDetailName}<span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => handleNoticeChange(key, e.target.value)}
                          className={`flex-1 px-2 py-1 border rounded text-xs focus:ring-1 focus:ring-[#E31837] outline-none ${
                            isEmpty ? 'border-red-300 bg-red-50' :
                            editedValue !== undefined && editedValue !== f.content ? 'border-[#E31837] bg-red-50/30' :
                            'border-gray-200'
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
          <span className="text-xs text-gray-400 block">고시정보 없음</span>
        )}
      </CollapsibleSection>

      {/* ❽ 속성 */}
      <CollapsibleSection
        title="속성"
        icon={<Hash className="w-3.5 h-3.5 text-teal-500" />}
        badge={meta?.attributes.length ? `${meta.attributes.length}개` : undefined}
        missingCount={attrMissing > 0 ? attrMissing : undefined}
        allComplete={meta !== undefined && attrMissing === 0}
      >
        {previewLoading ? (
          <div className="flex items-center gap-2 py-3 text-gray-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>카테고리 메타 로딩 중...</span>
          </div>
        ) : !meta ? (
          <p className="text-xs text-gray-400 py-2">카테고리를 먼저 선택하세요</p>
        ) : meta.attributes.length > 0 ? (
          <div className="space-y-1.5">
            {meta.attributes.map((attr, i) => {
              const editedValue = product.editedAttributeValues?.[attr.name] ?? '';
              const isEmpty = attr.required && !editedValue;
              const hasEnum = attr.attributeValues && attr.attributeValues.length > 0;

              return (
                <div key={i} className={`flex items-center gap-2 ${isEmpty ? 'border-l-2 border-l-red-400 pl-2' : ''}`}>
                  <label className={`text-[10px] w-28 shrink-0 truncate ${attr.required ? (isEmpty ? 'text-red-600 font-medium' : 'text-gray-700 font-medium') : 'text-gray-500'}`} title={attr.name}>
                    {attr.name}{attr.required && <span className="text-red-500">*</span>}
                  </label>
                  {hasEnum ? (
                    <select
                      value={editedValue}
                      onChange={(e) => handleAttributeChange(attr.name, e.target.value)}
                      className={`flex-1 px-2 py-1 border rounded text-xs focus:ring-1 focus:ring-[#E31837] outline-none ${
                        isEmpty ? 'border-red-300 bg-red-50' :
                        editedValue ? 'border-[#E31837] bg-red-50/30' : 'border-gray-200'
                      }`}
                    >
                      <option value="">선택하세요</option>
                      {attr.attributeValues!.map((av, j) => (
                        <option key={j} value={av.attributeValueName}>{av.attributeValueName}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={attr.dataType === 'NUMBER' ? 'number' : 'text'}
                      value={editedValue}
                      onChange={(e) => handleAttributeChange(attr.name, e.target.value)}
                      className={`flex-1 px-2 py-1 border rounded text-xs focus:ring-1 focus:ring-[#E31837] outline-none ${
                        isEmpty ? 'border-red-300 bg-red-50' :
                        editedValue ? 'border-[#E31837] bg-red-50/30' : 'border-gray-200'
                      }`}
                      placeholder={attr.dataType === 'NUMBER' ? '숫자' : '값 입력'}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <span className="text-xs text-gray-400 block">속성 없음</span>
        )}
      </CollapsibleSection>

      {/* ❾ 기타 설정 */}
      <CollapsibleSection
        title="기타 설정"
        icon={<Settings2 className="w-3.5 h-3.5 text-gray-500" />}
      >
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-24 shrink-0">세금유형</label>
            <select
              value={product.editedTaxType ?? 'TAX'}
              onChange={(e) => onUpdate(product.uid, 'editedTaxType', e.target.value)}
              className={`${selectBase} border-gray-200`}
            >
              <option value="TAX">과세</option>
              <option value="FREE">면세</option>
              <option value="ZERO">영세</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-24 shrink-0">성인전용</label>
            <select
              value={product.editedAdultOnly ?? 'EVERYONE'}
              onChange={(e) => onUpdate(product.uid, 'editedAdultOnly', e.target.value)}
              className={`${selectBase} border-gray-200`}
            >
              <option value="EVERYONE">전체</option>
              <option value="ADULT_ONLY">성인전용</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-24 shrink-0">병행수입</label>
            <select
              value={product.editedParallelImported ?? 'NOT_PARALLEL_IMPORTED'}
              onChange={(e) => onUpdate(product.uid, 'editedParallelImported', e.target.value)}
              className={`${selectBase} border-gray-200`}
            >
              <option value="NOT_PARALLEL_IMPORTED">병행수입 아님</option>
              <option value="PARALLEL_IMPORTED">병행수입</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-24 shrink-0">해외구매</label>
            <select
              value={product.editedOverseasPurchased ?? 'NOT_OVERSEAS_PURCHASED'}
              onChange={(e) => onUpdate(product.uid, 'editedOverseasPurchased', e.target.value)}
              className={`${selectBase} border-gray-200`}
            >
              <option value="NOT_OVERSEAS_PURCHASED">해외구매 아님</option>
              <option value="OVERSEAS_PURCHASED">해외구매</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-24 shrink-0">바코드</label>
            <input
              type="text"
              value={product.editedBarcode ?? ''}
              onChange={(e) => onUpdate(product.uid, 'editedBarcode', e.target.value)}
              className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-[#E31837] outline-none"
              placeholder="선택사항"
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
