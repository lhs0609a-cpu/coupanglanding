/**
 * Megaload 라우트 그룹의 공용 로딩 UI.
 *
 * Next.js 16 App Router 가 라우트 segment 전환 시 자동으로 Suspense fallback 으로 사용.
 * 사용자가 메뉴를 클릭한 순간 즉시 표시되어 "빈 화면" 체감을 제거 (perceived perf ↑).
 */
export default function MegaloadLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-[#E31837] rounded-full animate-spin" />
        <span className="text-xs text-gray-400">불러오는 중...</span>
      </div>
    </div>
  );
}
