'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  CheckCircle2, Package, Upload, Image as ImageIcon,
} from 'lucide-react';
import { useBulkRegisterActions } from './bulk/useBulkRegisterActions';
import { useThumbnailCache } from './bulk/useThumbnailCache';
import BulkStep1Settings from './bulk/BulkStep1Settings';
import BulkStep2Review from './bulk/BulkStep2Review';
import BulkStep3Progress from './bulk/BulkStep3Progress';

export default function BulkRegisterPanel() {
  const actions = useBulkRegisterActions();
  const { getThumbnail, loadThumbnail, cleanup } = useThumbnailCache(actions.products, actions.imagePreuploadCache);

  // Thumbnail cache for BulkProductTable
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string | null>>({});

  const handleLoadThumbnail = useCallback(async (uid: string) => {
    // Check sync cache first
    const sync = getThumbnail(uid);
    if (sync) {
      setThumbnailCache(prev => prev[uid] === sync ? prev : { ...prev, [uid]: sync });
      return;
    }
    // Async load (browser mode)
    const url = await loadThumbnail(uid);
    if (url) {
      setThumbnailCache(prev => ({ ...prev, [uid]: url }));
    }
  }, [getThumbnail, loadThumbnail]);

  // Batch preload thumbnails when products first appear (browser mode)
  useEffect(() => {
    if (actions.products.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const p of actions.products) {
        if (cancelled) break;
        if (thumbnailCache[p.uid]) continue;
        const sync = getThumbnail(p.uid);
        if (sync) {
          setThumbnailCache(prev => ({ ...prev, [p.uid]: sync }));
          continue;
        }
        if (p.scannedMainImages?.[0]?.handle) {
          try {
            const url = await loadThumbnail(p.uid);
            if (url && !cancelled) {
              setThumbnailCache(prev => ({ ...prev, [p.uid]: url }));
            }
          } catch { /* skip */ }
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions.products.length]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  const {
    step, products, imagePreuploadProgress, imagePreuploadCache,
  } = actions;

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[
          { num: 1, label: '설정' },
          { num: 2, label: '검증' },
          { num: 3, label: '등록' },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-gray-300" />}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                step === s.num
                  ? 'bg-[#E31837] text-white shadow-sm'
                  : step > s.num
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : <span>{s.num}</span>}
              {s.label}
            </div>
          </div>
        ))}
        {products.length > 0 && (
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Package className="w-3.5 h-3.5" /> {products.length}개 스캔됨
            </span>
            {imagePreuploadProgress.phase === 'uploading' && (
              <span className="flex items-center gap-1 text-xs text-purple-500">
                <Upload className="w-3.5 h-3.5 animate-pulse" />
                이미지 업로드 {imagePreuploadProgress.done}/{imagePreuploadProgress.total}
              </span>
            )}
            {imagePreuploadProgress.phase === 'complete' && Object.keys(imagePreuploadCache).length > 0 && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <ImageIcon className="w-3.5 h-3.5" />
                {Object.keys(imagePreuploadCache).length}개 업로드 완료
              </span>
            )}
          </div>
        )}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <BulkStep1Settings
          folderPaths={actions.folderPaths}
          brackets={actions.brackets}
          shippingPlaces={actions.shippingPlaces}
          returnCenters={actions.returnCenters}
          selectedOutbound={actions.selectedOutbound}
          selectedReturn={actions.selectedReturn}
          deliveryChargeType={actions.deliveryChargeType}
          deliveryCharge={actions.deliveryCharge}
          freeShipOverAmount={actions.freeShipOverAmount}
          returnCharge={actions.returnCharge}
          contactNumber={actions.contactNumber}
          generateAiContent={actions.generateAiContent}
          includeReviewImages={actions.includeReviewImages}
          noticeOverrides={actions.noticeOverrides}
          loadingShipping={actions.loadingShipping}
          shippingError={actions.shippingError}
          scanning={actions.scanning}
          scanError={actions.scanError}
          browsingFolder={actions.browsingFolder}
          onAddFolderPath={actions.addFolderPath}
          onRemoveFolderPath={actions.removeFolderPath}
          onSetSelectedOutbound={actions.setSelectedOutbound}
          onSetSelectedReturn={actions.setSelectedReturn}
          onSetDeliveryChargeType={actions.setDeliveryChargeType}
          onSetDeliveryCharge={actions.setDeliveryCharge}
          onSetFreeShipOverAmount={actions.setFreeShipOverAmount}
          onSetReturnCharge={actions.setReturnCharge}
          onSetContactNumber={actions.setContactNumber}
          onSetGenerateAiContent={actions.setGenerateAiContent}
          onSetIncludeReviewImages={actions.setIncludeReviewImages}
          onSetNoticeOverrides={actions.setNoticeOverrides}
          preventionConfig={actions.preventionConfig}
          onSetPreventionEnabled={actions.setPreventionEnabled}
          onRecalcPrices={actions.recalcPrices}
          onScan={actions.handleScan}
          onBrowseFolder={actions.handleBrowseFolder}
        />
      )}

      {/* Step 2 */}
      {step === 2 && (
        <BulkStep2Review
          products={actions.products}
          autoMatchingProgress={actions.autoMatchingProgress}
          autoMatchError={actions.autoMatchError}
          autoMatchStats={actions.autoMatchStats}
          onRetryAutoCategory={actions.retryAutoCategory}
          validating={actions.validating}
          validationPhase={actions.validationPhase}
          imagePreuploadProgress={actions.imagePreuploadProgress}
          imagePreuploadCache={actions.imagePreuploadCache}
          dryRunResults={actions.dryRunResults}
          deliveryChargeType={actions.deliveryChargeType}
          deliveryCharge={actions.deliveryCharge}
          freeShipOverAmount={actions.freeShipOverAmount}
          selectedCount={actions.selectedCount}
          totalSourcePrice={actions.totalSourcePrice}
          totalSellingPrice={actions.totalSellingPrice}
          validationReadyCount={actions.validationReadyCount}
          validationWarningCount={actions.validationWarningCount}
          validationErrorCount={actions.validationErrorCount}
          registerableCount={actions.registerableCount}
          categorySearchTarget={actions.categorySearchTarget}
          categoryKeyword={actions.categoryKeyword}
          categoryResults={actions.categoryResults}
          searchingCategory={actions.searchingCategory}
          onSetProducts={actions.setProducts}
          onToggle={actions.toggleProduct}
          onToggleAll={actions.toggleAll}
          onUpdate={actions.updateField}
          onCategoryClick={(uid) => actions.setCategorySearchTarget(uid)}
          onSetCategorySearchTarget={actions.setCategorySearchTarget}
          onSetCategoryKeyword={actions.setCategoryKeyword}
          onSearchCategory={actions.handleSearchCategory}
          onSelectCategory={actions.selectCategory}
          onDeepValidation={actions.handleDeepValidation}
          onRegister={actions.handleRegister}
          onBack={() => actions.setStep(1)}
          thumbnailCache={thumbnailCache}
          onLoadThumbnail={handleLoadThumbnail}
          onReorderImages={actions.handleReorderImages}
          onRemoveImage={actions.handleRemoveImage}
          getDetailImageUrls={actions.getDetailImageUrls}
          selectedOutbound={actions.selectedOutbound}
          selectedReturn={actions.selectedReturn}
          returnCharge={actions.returnCharge}
          contactNumber={actions.contactNumber}
          includeReviewImages={actions.includeReviewImages}
          noticeOverrides={actions.noticeOverrides}
        />
      )}

      {/* Step 3 */}
      {step === 3 && (
        <BulkStep3Progress
          products={actions.products}
          registering={actions.registering}
          isPaused={actions.isPaused}
          batchProgress={actions.batchProgress}
          startTime={actions.startTime}
          imagePreuploadCacheSize={Object.keys(actions.imagePreuploadCache).length}
          onTogglePause={actions.togglePause}
          onReset={actions.handleReset}
        />
      )}
    </div>
  );
}
