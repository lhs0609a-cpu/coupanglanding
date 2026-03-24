'use client';

import { useCallback, useMemo, useRef, memo } from 'react';
import { FixedSizeList, type ListOnItemsRenderedProps } from 'react-window';
import BulkProductRow, { GRID_TEMPLATE } from './BulkProductRow';
import type { EditableProduct, SortField, SortDirection } from './types';

const ROW_HEIGHT = 56;
const OVERSCAN = 15;

interface BulkProductTableProps {
  products: EditableProduct[];
  selectedUid: string | null;
  thumbnailCache: Record<string, string | null>;
  sortField: SortField;
  sortDirection: SortDirection;
  onToggle: (uid: string) => void;
  onToggleAll: () => void;
  onUpdate: (uid: string, field: string, value: string | number) => void;
  onCategoryClick: (uid: string) => void;
  onRowClick: (uid: string) => void;
  onLoadThumbnail: (uid: string) => void;
  onSort: (field: SortField) => void;
}

/** react-window itemData — 이 참조가 변경되면 모든 visible row가 re-render */
interface RowData {
  products: EditableProduct[];
  selectedUid: string | null;
  thumbnailCache: Record<string, string | null>;
  onLoadThumbnail: (uid: string) => void;
  onToggle: (uid: string) => void;
  onUpdate: (uid: string, field: string, value: string | number) => void;
  onCategoryClick: (uid: string) => void;
  onRowClick: (uid: string) => void;
}

/** 안정적인 Row 컴포넌트 — useCallback 대신 별도 컴포넌트로 분리하여 react-window가 올바르게 re-render */
const Row = memo(function Row({ index, style, data }: { index: number; style: React.CSSProperties; data: RowData }) {
  const p = data.products[index];
  if (!p) return null;
  return (
    <BulkProductRow
      product={p}
      style={style}
      isSelected={data.selectedUid === p.uid}
      thumbnailUrl={data.thumbnailCache[p.uid] ?? null}
      onLoadThumbnail={data.onLoadThumbnail}
      onToggle={data.onToggle}
      onUpdate={data.onUpdate}
      onCategoryClick={data.onCategoryClick}
      onRowClick={data.onRowClick}
    />
  );
});

export default function BulkProductTable({
  products,
  selectedUid,
  thumbnailCache,
  sortField,
  sortDirection,
  onToggle,
  onToggleAll,
  onUpdate,
  onCategoryClick,
  onRowClick,
  onLoadThumbnail,
  onSort,
}: BulkProductTableProps) {
  const listRef = useRef<FixedSizeList>(null);

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return <span className="ml-0.5">{sortDirection === 'asc' ? '▲' : '▼'}</span>;
  };

  const headerClass = (field: SortField) =>
    `cursor-pointer select-none hover:text-gray-700 transition ${sortField === field ? 'text-gray-800 font-bold' : ''}`;

  const handleItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }: ListOnItemsRenderedProps) => {
      for (let i = visibleStartIndex; i <= visibleStopIndex; i++) {
        const p = products[i];
        if (p && !(p.uid in thumbnailCache)) {
          onLoadThumbnail(p.uid);
        }
      }
    },
    [products, thumbnailCache, onLoadThumbnail],
  );

  // itemData가 변경되면 react-window가 모든 visible row를 갱신한다
  const itemData: RowData = useMemo(() => ({
    products,
    selectedUid,
    thumbnailCache,
    onLoadThumbnail,
    onToggle,
    onUpdate,
    onCategoryClick,
    onRowClick,
  }), [products, selectedUid, thumbnailCache, onLoadThumbnail, onToggle, onUpdate, onCategoryClick, onRowClick]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Fixed header */}
      <div
        className="grid items-center bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 sticky top-0 z-10"
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
        role="row"
      >
        <div className="px-2">
          <input
            type="checkbox"
            checked={products.length > 0 && products.every(p => p.selected)}
            onChange={onToggleAll}
            className="rounded border-gray-300"
          />
        </div>
        <div className="px-1 text-center">이미지</div>
        <div className="px-2">코드</div>
        <div className={`px-2 ${headerClass('name')}`} onClick={() => onSort('name')}>
          상품명<SortIndicator field="name" />
        </div>
        <div className={`px-2 text-right ${headerClass('price')}`} onClick={() => onSort('price')}>
          원가<SortIndicator field="price" />
        </div>
        <div className="px-2 text-right">판매가</div>
        <div className={`px-2 ${headerClass('confidence')}`} onClick={() => onSort('confidence')}>
          카테고리<SortIndicator field="confidence" />
        </div>
        <div className="px-2 text-center">이미지 수</div>
      </div>

      {/* Virtualized list — itemData로 데이터 전달, 변경 시 자동 갱신 */}
      <FixedSizeList
        ref={listRef}
        height={Math.min(products.length * ROW_HEIGHT, 600)}
        itemCount={products.length}
        itemSize={ROW_HEIGHT}
        overscanCount={OVERSCAN}
        onItemsRendered={handleItemsRendered}
        width="100%"
        style={{ overflowX: 'hidden' }}
        itemKey={(index) => products[index]?.uid ?? index}
        itemData={itemData}
      >
        {Row}
      </FixedSizeList>

      {products.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">
          표시할 상품이 없습니다.
        </div>
      )}
    </div>
  );
}
