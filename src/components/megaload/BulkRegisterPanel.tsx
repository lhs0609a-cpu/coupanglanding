'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  CheckCircle2, Package, Upload, Image as ImageIcon,
} from 'lucide-react';
import { useBulkRegisterActions } from './bulk/useBulkRegisterActions';
import { useThumbnailCache } from './bulk/useThumbnailCache';
import { useStockCheck } from './bulk/useStockCheck';
import BulkStep1Settings from './bulk/BulkStep1Settings';
import BulkStep2Review from './bulk/BulkStep2Review';
import BulkStep3Progress from './bulk/BulkStep3Progress';
import AutoModeModal from './bulk/AutoModeModal';
import FinalReviewModal from './bulk/FinalReviewModal';
import { useAutoMode } from './bulk/useAutoMode';
import { Zap } from 'lucide-react';

export default function BulkRegisterPanel() {
  const actions = useBulkRegisterActions();
  const { getThumbnail, loadThumbnail, cleanup } = useThumbnailCache(actions.products, actions.imagePreuploadCache);
  const { state: stockState, runStockCheck } = useStockCheck();
  const autoMode = useAutoMode();
  const [autoModalOpen, setAutoModalOpen] = useState(false);
  // ─── 자동 모드 최종 확인 게이트 ───
  // preflight 완료 → 사용자가 썸네일/가격/원본링크/노출상품명 확인 → 확정 → register
  const [finalReviewOpen, setFinalReviewOpen] = useState(false);
  const [excludedUids, setExcludedUids] = useState<Set<string>>(new Set());
  // 자동 모드: handleRegister 가 한 번만 호출되도록 가드
  const autoRegisterFiredRef = useRef(false);
  const finalReviewShownRef = useRef(false);
  // 자동 모드: 체크포인트 마지막 진행 인덱스 추적 (delta 계산용)
  const autoCheckpointLastIdxRef = useRef(0);
  const autoCheckpointLastSuccessRef = useRef(0);
  const autoCheckpointLastFailRef = useRef(0);

  // ─── 자동 모드 chain: preflight 완료 → 최종 확인 모달 → 확정 시 handleRegister ───
  useEffect(() => {
    if (!autoMode.activeJobId) return;
    if (finalReviewShownRef.current) return;
    if (actions.step !== 2) return;
    if (actions.preflightPhase !== 'complete') return;
    if (!actions.canRegister) return;
    finalReviewShownRef.current = true;
    setExcludedUids(new Set());
    setFinalReviewOpen(true);
    console.log('[auto-mode] preflight 완료 → 최종 확인 게이트 노출');
  }, [autoMode.activeJobId, actions.step, actions.preflightPhase, actions.canRegister]);

  const handleFinalConfirm = useCallback(() => {
    if (autoRegisterFiredRef.current) return;
    autoRegisterFiredRef.current = true;
    // 사용자가 체크 해제한 상품은 selected=false 로 전환 → handleRegister 가 자동 skip
    if (excludedUids.size > 0) {
      actions.setProducts(prev => prev.map(p =>
        excludedUids.has(p.uid) ? { ...p, selected: false } : p,
      ));
    }
    setFinalReviewOpen(false);
    // 다음 tick 에 handleRegister — setProducts 반영 후 실행
    setTimeout(() => actions.handleRegister(), 50);
  }, [excludedUids, actions]);

  const handleFinalAbort = useCallback(() => {
    setFinalReviewOpen(false);
    if (autoMode.activeJobId) {
      autoMode.finalizeJob(autoMode.activeJobId, 'aborted', { reason: 'user_cancelled_final_review' });
    }
    // 자동 모드 종료 — 사용자가 step 2 에서 수동 검토 후 직접 등록 가능
    autoRegisterFiredRef.current = false;
    finalReviewShownRef.current = false;
  }, [autoMode]);

  // ─── 자동 모드: products status 변화 시 체크포인트 영속화 + Gate 2 watchdog ───
  // batchProgress 는 { current, total } 만 제공하므로 success/failed 는 products[].status 에서 집계.
  useEffect(() => {
    const jobId = autoMode.activeJobId;
    if (!jobId) return;
    if (actions.step !== 3) return;
    const total = actions.products.length;
    if (total === 0) return;

    const successNow = actions.products.filter(p => p.status === 'success').length;
    const failedNow = actions.products.filter(p => p.status === 'error').length;
    const processedNow = successNow + failedNow;
    if (processedNow === autoCheckpointLastIdxRef.current) return;

    const processedDelta = processedNow - autoCheckpointLastIdxRef.current;
    const successDelta = successNow - autoCheckpointLastSuccessRef.current;
    const failedDelta = failedNow - autoCheckpointLastFailRef.current;
    autoCheckpointLastIdxRef.current = processedNow;
    autoCheckpointLastSuccessRef.current = successNow;
    autoCheckpointLastFailRef.current = failedNow;

    // 체크포인트 비동기 영속화 (fire-and-forget — 실패해도 등록 진행)
    autoMode.checkpoint(jobId, {
      processedDelta,
      successDelta,
      failedDelta,
      lastIdx: processedNow,
    });

    // Gate 2 watchdog: 실패율 임계치 초과 시 자동 일시정지
    // 최소 표본 20개 후부터 평가 (초반 한두 개 실패로 멈추는 노이즈 방지)
    if (processedNow >= 20 && !actions.isPaused) {
      const failureRate = failedNow / processedNow;
      if (failureRate >= 0.10) {
        console.warn(`[auto-mode] Gate 2 트리거 — 실패율 ${(failureRate * 100).toFixed(1)}% (>= 10%)`);
        autoMode.pauseJob(jobId, 'failure_rate', {
          rate: failureRate,
          processed: processedNow,
          failed: failedNow,
        });
        actions.togglePause();
      }
    }

    // 모든 상품 처리 완료 → finalize
    if (processedNow >= total) {
      const finalStatus: 'completed' | 'failed' = failedNow > 0 && failedNow === total ? 'failed' : 'completed';
      autoMode.finalizeJob(jobId, finalStatus, {
        total,
        success: successNow,
        failed: failedNow,
      });
      console.log(`[auto-mode] 완료 — ${successNow}/${total} 성공`);
    }
  }, [actions.products, actions.step, actions.isPaused, autoMode, actions]);

  // 진입 시 미완료 잡 확인 (탭 닫혀도 resume 가능)
  useEffect(() => {
    autoMode.checkResumable();
  }, [autoMode]);

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

  // P0-4: 안정적 콜백 참조 — 인라인 화살표 함수 제거로 자식 re-render 방지
  const handleCategoryClick = useCallback((uid: string) => {
    actions.setCategorySearchTarget(uid);
  }, [actions.setCategorySearchTarget]);

  const handleBack = useCallback(() => {
    actions.setStep(1);
  }, [actions.setStep]);

  // Step 2 진입 시 자동 품절 체크
  const stockCheckTriggeredRef = useRef(false);
  useEffect(() => {
    if (step === 2 && !stockCheckTriggeredRef.current && products.length > 0) {
      const selected = products.filter(p => p.selected && p.sourceUrl);
      if (selected.length > 0) {
        stockCheckTriggeredRef.current = true;
        runStockCheck(selected);
      }
    }
    if (step !== 2) {
      stockCheckTriggeredRef.current = false;
    }
  }, [step, products.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStockCheck = useCallback(() => {
    const selected = actions.products.filter(p => p.selected);
    runStockCheck(selected);
  }, [actions.products, runStockCheck]);

  const handleExcludeSoldOut = useCallback(() => {
    const soldOutUids = new Set(
      Object.entries(stockState.results)
        .filter(([, r]) => r.status === 'sold_out' || r.status === 'removed')
        .map(([uid]) => uid),
    );
    if (soldOutUids.size === 0) return;
    actions.setProducts(prev => prev.map(p =>
      soldOutUids.has(p.uid) ? { ...p, selected: false } : p,
    ));
  }, [stockState.results, actions.setProducts]);

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
        <div className="ml-auto flex items-center gap-3">
          {/* 올인원 자동 등록 진입 — 사전분석 + Gate 1 확인 모달 */}
          <button
            onClick={() => setAutoModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg font-medium transition"
            title="최상위 폴더 1번 선택 → 자동 스캔 + 등록"
          >
            <Zap className="w-3.5 h-3.5" />
            무인 자동등록
          </button>
        </div>
        {products.length > 0 && (
          <div className="ml-3 flex items-center gap-3">
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

      {/* 이어하기 배너 — IndexedDB에 저장된 이전 작업 복원 제안 */}
      {actions.restoreCandidate && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <span className="text-sm text-amber-900">
            💾 저장된 이전 작업이 있습니다 — <b>{actions.restoreCandidate.count}개 상품</b>, {Math.round((Date.now() - actions.restoreCandidate.savedAt) / 60000)}분 전. 이어서 진행할까요?
          </span>
          <span className="flex-1" />
          <button onClick={actions.applyRestore} className="px-3 py-1.5 text-sm font-semibold bg-[#E31837] text-white rounded-lg hover:bg-[#c5142f]">이어하기</button>
          <button onClick={actions.discardRestore} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">새로 시작</button>
        </div>
      )}

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
          includeReviewImages={actions.includeReviewImages}
          useStockImages={actions.useStockImages}
          noticeOverrides={actions.noticeOverrides}
          loadingShipping={actions.loadingShipping}
          shippingError={actions.shippingError}
          scanning={actions.scanning}
          scanError={actions.scanError}
          browsingFolder={actions.browsingFolder}
          browseProgress={actions.browseProgress}
          onAddFolderPath={actions.addFolderPath}
          onRemoveFolderPath={actions.removeFolderPath}
          onSetSelectedOutbound={actions.setSelectedOutbound}
          onSetSelectedReturn={actions.setSelectedReturn}
          onSetDeliveryChargeType={actions.setDeliveryChargeType}
          onSetDeliveryCharge={actions.setDeliveryCharge}
          onSetFreeShipOverAmount={actions.setFreeShipOverAmount}
          onSetReturnCharge={actions.setReturnCharge}
          onSetContactNumber={actions.setContactNumber}
          onSetIncludeReviewImages={actions.setIncludeReviewImages}
          onSetUseStockImages={actions.setUseStockImages}
          onSetNoticeOverrides={actions.setNoticeOverrides}
          preventionConfig={actions.preventionConfig}
          onSetPreventionEnabled={actions.setPreventionEnabled}
          onSetSellerBrand={actions.setSellerBrand}
          onSetAutoBarcodeGeneration={actions.setAutoBarcodeGeneration}
          onRecalcPrices={actions.recalcPrices}
          onScan={actions.handleScan}
          onBrowseFolder={actions.handleBrowseFolder}
          savedThirdPartyUrls={actions.savedThirdPartyUrls}
          onUploadThirdPartyImages={actions.handleUploadThirdPartyImages}
          onRemoveThirdPartyUrl={actions.handleRemoveThirdPartyUrl}
          onClearThirdPartyUrls={actions.handleClearThirdPartyUrls}
          onSaveSettings={actions.saveSettingsToServer}
          savingSettings={actions.savingSettings}
          settingsSavedAt={actions.settingsSavedAt}
          settingsSaveError={actions.settingsSaveError}
        />
      )}

      {/* Step 2 */}
      {step === 2 && (
        <BulkStep2Review
          products={actions.products}
          autoMatchingProgress={actions.autoMatchingProgress}
          autoMatchError={actions.autoMatchError}
          autoMatchStats={actions.autoMatchStats}
          categoryFailures={actions.categoryFailures}
          onRetryAutoCategory={actions.retryAutoCategory}
          imageFilterProgress={actions.imageFilterProgress}
          titleGenProgress={actions.titleGenProgress}
          contentGenProgress={actions.contentGenProgress}
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
          onCategoryClick={handleCategoryClick}
          onSetCategorySearchTarget={actions.setCategorySearchTarget}
          onSetCategoryKeyword={actions.setCategoryKeyword}
          onSearchCategory={actions.handleSearchCategory}
          onSelectCategory={actions.selectCategory}
          onDeepValidation={actions.handleDeepValidation}
          onRegister={actions.handleRegister}
          onBack={handleBack}
          thumbnailCache={thumbnailCache}
          onLoadThumbnail={handleLoadThumbnail}
          onReorderImages={actions.handleReorderImages}
          onRemoveImage={actions.handleRemoveImage}
          onToggleAutoExclude={actions.handleToggleAutoExclude}
          onTogglePromoteReview={actions.handleTogglePromoteReview}
          onPrewarmProduct={actions.handlePrewarmProduct}
          onPrewarmCancel={actions.handlePrewarmCancel}
          onSwapStockImage={actions.handleSwapStockImage}
          onBulkRegenerateThumbnails={actions.handleBulkRegenerateThumbnails}
          thumbnailRegen={actions.thumbnailRegen}
          getDetailImageUrls={actions.getDetailImageUrls}
          selectedOutbound={actions.selectedOutbound}
          selectedReturn={actions.selectedReturn}
          returnCharge={actions.returnCharge}
          contactNumber={actions.contactNumber}
          includeReviewImages={actions.includeReviewImages}
          noticeOverrides={actions.noticeOverrides}
          preventionConfig={actions.preventionConfig}
          categoryMetaCache={actions.categoryMetaCache}
          preflightPhase={actions.preflightPhase}
          preflightResults={actions.preflightResults}
          preflightStats={actions.preflightStats}
          preflightDurationMs={actions.preflightDurationMs}
          preflightErrorReason={actions.preflightErrorReason}
          canaryPhase={actions.canaryPhase}
          canaryResult={actions.canaryResult}
          canaryTargetUid={actions.canaryTargetUid}
          canRegister={actions.canRegister}
          onPreflight={actions.handlePreflight}
          onCanary={actions.handleCanary}
          lowConfidenceCount={actions.lowConfidenceProducts.length}
          rematchingCategory={actions.rematchingCategory}
          onRematchLowConfidence={actions.rematchLowConfidence}
          onFetchCategorySuggestions={actions.fetchCategorySuggestions}
          stockCheckPhase={stockState.phase}
          stockCheckProgress={stockState.progress}
          stockCheckResults={stockState.results}
          stockCheckStats={stockState.stats}
          onStockCheck={handleStockCheck}
          onExcludeSoldOut={handleExcludeSoldOut}
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
          accountBlocked={actions.accountBlocked}
          onTogglePause={actions.togglePause}
          onReset={actions.handleReset}
          onRetryFailed={() => { actions.retryFailed(); actions.handleRegister(); }}
          onBackToStep2={actions.backToStep2}
          onJumpToErrorGroup={actions.jumpToErrorGroup}
        />
      )}

      {/* 자동 모드 최종 확인 게이트 — 등록 직전 썸네일/가격/링크/상품명 검토 */}
      <FinalReviewModal
        open={finalReviewOpen}
        products={actions.products}
        imagePreuploadCache={actions.imagePreuploadCache}
        excludedUids={excludedUids}
        onToggleExclude={(uid) => setExcludedUids(prev => {
          const next = new Set(prev);
          if (next.has(uid)) next.delete(uid);
          else next.add(uid);
          return next;
        })}
        onConfirm={handleFinalConfirm}
        onAbort={handleFinalAbort}
      />

      {/* 올인원 자동 등록 모달 — 폴더 1번 선택 → 사전분석 → Gate 1 확인 → 자동 실행 */}
      <AutoModeModal
        open={autoModalOpen}
        onClose={() => setAutoModalOpen(false)}
        onPickAndAnalyze={autoMode.pickAndAnalyze}
        onStart={async (params) => {
          // 1) 잡 생성 + Gate 1 confirm (서버 영속)
          await autoMode.startJob(params);
          // 2) 스캔 결과 재사용 — picker 재호출 없이 즉시 step 2 진입
          const scan = autoMode.consumeLastScan() as Awaited<ReturnType<typeof import('@/lib/megaload/services/client-folder-scanner').pickAndScanFolder>> | null;
          if (scan) {
            actions.startFromScannedResult(scan);
            // 이후 자동 chain 은 BulkRegisterPanel 의 useEffect 가 autoMode.activeJobId 를 감지해서 처리.
          }
        }}
      />
    </div>
  );
}
