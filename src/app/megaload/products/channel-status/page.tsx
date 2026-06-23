'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CHANNEL_SHORT_LABELS, CHANNEL_LABELS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';
import { Loader2, RefreshCw, Grid3x3, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

interface MatrixRow {
  productId: string;
  productName: string;
  channels: Record<string, { status: string; url?: string; error?: string }>;
}
interface StatusData {
  targetChannels: Channel[];
  total: number;
  limit: number;
  offset: number;
  matrix: MatrixRow[];
  summary: Record<string, Record<string, number>>;
}

// 상태 → 색/라벨
const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  active: { bg: 'bg-green-500', label: '판매중' },
  registering: { bg: 'bg-blue-400', label: '등록중' },
  pending: { bg: 'bg-blue-300', label: '대기' },
  queued: { bg: 'bg-blue-300', label: '대기' },
  mapping: { bg: 'bg-blue-300', label: '변환중' },
  needs_input: { bg: 'bg-amber-400', label: '입력필요' },
  failed: { bg: 'bg-red-500', label: '실패' },
  deleted: { bg: 'bg-gray-400', label: '삭제' },
  suspended: { bg: 'bg-gray-400', label: '중지' },
  stale: { bg: 'bg-purple-400', label: '갱신대기' },
};

function Dot({ status }: { status?: string }) {
  if (!status) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-200" title="미등록" />;
  const s = STATUS_STYLE[status] || { bg: 'bg-gray-300', label: status };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${s.bg}`} title={s.label} />;
}

export default function ChannelStatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/megaload/products/channel-status?limit=${limit}&offset=${offset}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [offset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const cols: Channel[] = data ? (['coupang', ...data.targetChannels] as Channel[]) : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Grid3x3 className="w-6 h-6 text-[#E31837]" /> 채널 등록 현황
          </h1>
          <p className="text-gray-500 mt-1 text-sm">상품별 채널 등록 상태 한눈에 보기. 막힌 건은 <Link href="/megaload/products/exceptions" className="text-[#E31837] underline">예외큐</Link>에서 해결.</p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> 새로고침
        </button>
      </div>

      {/* 채널별 요약 */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {data.targetChannels.map((ch) => {
            const s = data.summary[ch] || {};
            return (
              <div key={ch} className="border rounded-xl p-3 bg-white">
                <div className="font-semibold text-sm mb-1.5">{CHANNEL_LABELS[ch] || ch}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600">
                  <span className="text-green-600">판매중 {s.active || 0}</span>
                  {(s.needs_input || 0) > 0 && <span className="text-amber-600">입력필요 {s.needs_input}</span>}
                  {(s.failed || 0) > 0 && <span className="text-red-600">실패 {s.failed}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : !data || data.matrix.length === 0 ? (
        <div className="text-center py-20 text-gray-500">쿠팡에 등록된 상품이 없습니다.</div>
      ) : (
        <>
          <div className="border rounded-xl overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium sticky left-0 bg-gray-50">상품</th>
                  {cols.map((ch) => (
                    <th key={ch} className="px-3 py-2 font-medium text-center whitespace-nowrap">
                      {CHANNEL_SHORT_LABELS[ch] || CHANNEL_LABELS[ch] || ch}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((row) => (
                  <tr key={row.productId} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 max-w-[280px] truncate sticky left-0 bg-white" title={row.productName}>
                      {row.productName}
                    </td>
                    {cols.map((ch) => {
                      const cell = ch === 'coupang' ? row.channels.coupang || { status: 'active' } : row.channels[ch];
                      return (
                        <td key={ch} className="px-3 py-2 text-center" title={cell?.error || STATUS_STYLE[cell?.status || '']?.label || '미등록'}>
                          {cell?.url ? (
                            <a href={cell.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5">
                              <Dot status={cell?.status} /><ExternalLink className="w-2.5 h-2.5 text-gray-300" />
                            </a>
                          ) : (
                            <Dot status={cell?.status} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 범례 + 페이지네이션 */}
          <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
            <div className="flex flex-wrap gap-3">
              {Object.entries(STATUS_STYLE).slice(0, 6).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1"><span className={`inline-block w-2.5 h-2.5 rounded-full ${v.bg}`} /> {v.label}</span>
              ))}
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-200" /> 미등록</span>
            </div>
            <div className="flex items-center gap-2">
              <span>{offset + 1}–{Math.min(offset + limit, data.total)} / {data.total}</span>
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}
                className="p-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
              <button disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)}
                className="p-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
