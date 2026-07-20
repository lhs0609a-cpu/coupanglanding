'use client';

// ============================================================
// 인증(KC 등) 등록 상태 — 검수 화면 공용 블록
//
// 올인원 / 대량등록 두 검수 화면이 같은 UI 를 쓴다.
// 등록 전에 "이 인증번호가 어느 쿠팡 인증 항목으로 들어가는지"를 보여주고,
// 못 붙는 게 있으면 등록 전에 알려준다(등록 후엔 찾기 어렵다).
// ============================================================

import type { CertPreviewResult } from '@/app/api/megaload/products/cert-preview/route';

interface Props {
  /** uid → 미리보기 결과 */
  previews: Map<string, CertPreviewResult>;
  /** 검수 대상 상품 (uid + 표시용 이름) */
  products: { uid: string; name: string }[];
  loading?: boolean;
  onRetry?: () => void;
}

export function CertStatusBlock({ previews, products, loading, onRetry }: Props) {
  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        인증정보(KC) 확인 중…
      </div>
    );
  }

  const rows = products
    .map((p) => ({ product: p, preview: previews.get(p.uid) }))
    .filter((r): r is { product: { uid: string; name: string }; preview: CertPreviewResult } => !!r.preview);

  if (rows.length === 0) return null;

  const problems = rows.filter((r) => r.preview.status === 'failed' || r.preview.status === 'partial' || r.preview.status === 'error');
  const okCount = rows.filter((r) => r.preview.status === 'ok').length;
  const noneCount = rows.filter((r) => r.preview.status === 'none').length;

  // 문제가 없으면 접힌 한 줄 요약만 (검수 화면을 어지럽히지 않는다)
  if (problems.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
        <span className="font-semibold">인증정보 확인 완료</span>
        {okCount > 0 && <span className="ml-2">인증번호 등록 {okCount}건</span>}
        {noneCount > 0 && <span className="ml-2 text-emerald-700">인증 대상 아님 {noneCount}건</span>}
      </div>
    );
  }

  const failedCount = rows.filter((r) => r.preview.status === 'failed').length;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-amber-900">
            인증정보(KC) 확인 필요 — {problems.length}건
          </h4>
          <p className="mt-1 text-xs text-amber-800">
            {failedCount > 0
              ? `${failedCount}건은 소싱한 인증번호가 등록에 반영되지 않습니다. 이대로 올리면 "인증대상아님"으로 등록됩니다.`
              : '일부 인증번호가 등록에서 빠집니다.'}
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            다시 확인
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {problems.map(({ product, preview }) => (
          <li key={product.uid} className="rounded-md border border-amber-200 bg-white px-3 py-2">
            <div className="truncate text-xs font-semibold text-gray-900">{product.name}</div>
            {preview.matched.length > 0 && (
              <div className="mt-1 text-xs text-emerald-700">
                반영됨: {preview.matched.map((m) => `${m.certificationName} (${m.certificationCode})`).join(', ')}
              </div>
            )}
            {preview.unmatched.length > 0 && (
              <div className="mt-1 text-xs text-amber-800">
                빠짐: {preview.unmatched.join(' / ')}
              </div>
            )}
            {preview.message && (
              <div className="mt-1 text-[11px] text-gray-600">{preview.message}</div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] text-amber-800">
        전기용품·어린이제품 등 인증 대상 상품을 인증정보 없이 등록하면 쿠팡 판매 정지 사유가 될 수 있습니다.
        인증번호는 쿠팡 윙에서 직접 입력해 보완할 수 있습니다.
      </p>
    </div>
  );
}
