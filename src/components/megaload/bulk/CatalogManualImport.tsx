'use client';

import { useEffect, useState } from 'react';
import { CATALOG_MANUAL_KEY, CATALOG_MANUAL_TTL, catalogToScan, type CatalogExportProduct } from '@/lib/megaload/catalog-manual-import';
import { findHelper, kickQueue } from '@/lib/megaload/naver-ingest-local';

interface Props {
  ready: boolean;
  onImport: (scan: ReturnType<typeof catalogToScan>) => void;
}

export default function CatalogManualImport({ ready, onImport }: Props) {
  const [batch, setBatch] = useState<{ token: string; ids: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [available, setAvailable] = useState<CatalogExportProduct[]>([]);
  const [missing, setMissing] = useState<Array<{ id: string; title: string; reason: string }>>([]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('catalog');
    if (!token) return;
    try {
      const value = JSON.parse(sessionStorage.getItem(CATALOG_MANUAL_KEY + token) || 'null');
      if (!value || !Array.isArray(value.ids) || !value.ids.length || value.ids.length > 200
        || value.ids.some((id: unknown) => typeof id !== 'string')
        || !Number.isFinite(value.at) || Date.now() - value.at > CATALOG_MANUAL_TTL) {
        throw new Error('카탈로그 선택 정보가 만료됐습니다. 카탈로그에서 상품을 다시 선택해주세요.');
      }
      setBatch({ token, ids: value.ids });
    } catch (e) { setError(e instanceof Error ? e.message : '선택 정보를 읽을 수 없습니다.'); }
  }, []);

  const importProducts = (products: CatalogExportProduct[]) => {
    if (!batch || !ready) return;
    onImport(catalogToScan(products, batch.token));
  };

  const load = async () => {
    if (!batch || !ready || busy) return;
    setBusy(true); setError(''); setNote(''); setAvailable([]); setMissing([]);
    try {
      const res = await fetch('/api/megaload/naver-sourcing/products/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: batch.ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '상품을 불러오지 못했습니다.');
      const products = data.products as CatalogExportProduct[];
      const skipped = data.skipped as Array<{ id: string; title: string; reason: string }>;
      if (!Array.isArray(products) || !Array.isArray(skipped)) throw new Error('상품 응답 형식이 올바르지 않습니다.');
      const found = new Set([...products.map((p) => p.id), ...skipped.map((p) => p.id)]);
      const absent = batch.ids.filter((id) => !found.has(id)).map((id) => ({ id, title: id, reason: '카탈로그에서 삭제된 상품' }));
      setAvailable(products); setMissing([...skipped, ...absent]);
      if (!skipped.length && !absent.length) importProducts(products);
      else setNote(`선택 ${batch.ids.length}개 중 준비 완료 ${products.length}개 · 미준비/삭제 ${skipped.length + absent.length}개`);
    } catch (e) { setError(e instanceof Error ? e.message : '불러오기 실패'); }
    finally { setBusy(false); }
  };

  const requestDetails = async () => {
    setBusy(true); setError('');
    try {
      const ids = missing.filter((p) => p.reason === '상세 미확보').map((p) => p.id);
      const res = await fetch('/api/megaload/naver-sourcing/products/queue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '상세 요청 실패');
      const helper = await findHelper();
      if (helper) await kickQueue(helper.ep);
      setNote(`상세 준비 ${data.requested ?? 0}개 요청됨${data.blocked ? ` · 상세 수집 미지원 ${data.blocked}개` : ''}. 네이버에 로그인된 도우미가 상세를 수집한 뒤 ‘다시 불러오기’를 눌러주세요.`);
    } catch (e) { setError(e instanceof Error ? e.message : '상세 요청 실패'); }
    finally { setBusy(false); }
  };

  if (!batch && !error) return null;
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <p className="font-semibold text-blue-950">네이버 카탈로그 수동등록{batch ? ` · 선택 ${batch.ids.length}개` : ''}</p>
      <p className="text-sm text-blue-900">아래에서 출고지·반품지와 마진을 설정한 뒤 상품을 불러오세요. 기존 검수 화면에서 상품명·가격·카테고리·이미지를 수정하고 등록할 수 있습니다.</p>
      {!ready && batch && <p className="text-sm text-blue-800">설정 로딩이 끝나면 출고지와 반품지를 선택해주세요.</p>}
      {batch && <button type="button" onClick={load} disabled={!ready || busy}
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-40">
        {busy ? '처리 중…' : missing.length ? '다시 불러오기' : '선택 상품 불러와서 수동 검수'}
      </button>}
      {note && <p role="status" className="text-sm text-blue-900">{note}</p>}
      {missing.length > 0 && <>
        <ul className="max-h-40 overflow-auto text-sm text-amber-900">
          {missing.map((p) => <li key={p.id}>{p.title} — {p.reason}</li>)}
        </ul>
        <div className="flex flex-wrap gap-2">
          {missing.some((p) => p.reason === '상세 미확보') && <button type="button" onClick={requestDetails} disabled={busy}
            className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm disabled:opacity-40">미준비 상품 상세 요청</button>}
          {available.length > 0 && <button type="button" disabled={busy || !ready} onClick={() => {
            try { importProducts(available); } catch (e) { setError(e instanceof Error ? e.message : '불러오기 실패'); }
          }} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm disabled:opacity-40">
            준비된 {available.length}개만 검수 ({missing.length}개 제외)
          </button>}
        </div>
      </>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <a href="/megaload/sourcing/naver" className="inline-block text-sm text-blue-800 underline">카탈로그로 돌아가기</a>
    </div>
  );
}
