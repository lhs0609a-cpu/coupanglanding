'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, getCurrentYearMonth, formatYearMonth } from '@/lib/utils/format';
import { REVENUE_SOURCES } from '@/lib/utils/constants';
import { exportToCsv } from '@/lib/utils/csv-export';
import MonthPicker from '@/components/ui/MonthPicker';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import NumberInput from '@/components/ui/NumberInput';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { StatCardSkeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { Plus, Pencil, Trash2, Download, Search, Receipt } from 'lucide-react';
import type { RevenueEntry, Partner } from '@/lib/supabase/types';

export default function AdminRevenuePage() {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [revenues, setRevenues] = useState<RevenueEntry[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [source, setSource] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [mainPartnerId, setMainPartnerId] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [revRes, partnerRes] = await Promise.all([
      supabase.from('revenue_entries').select('*, main_partner:partners(display_name)').eq('year_month', yearMonth).order('created_at', { ascending: false }),
      supabase.from('partners').select('*'),
    ]);

    setRevenues((revRes.data as RevenueEntry[]) || []);
    setPartners((partnerRes.data as Partner[]) || []);
    setLoading(false);
  }, [yearMonth, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setSource('');
    setDescription('');
    setAmount(0);
    setMainPartnerId('');
    setReceiptFile(null);
    setReceiptPreview(null);
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (entry: RevenueEntry) => {
    setEditingId(entry.id);
    setSource(entry.source);
    setDescription(entry.description);
    setAmount(entry.amount);
    setMainPartnerId(entry.main_partner_id || '');
    setReceiptPreview(entry.receipt_url || null);
    setReceiptFile(null);
    setModalOpen(true);
  };

  const uploadReceipt = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `revenue/${yearMonth}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('receipts').upload(path, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from('receipts').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSave = async () => {
    let receiptUrl = receiptPreview;
    if (receiptFile) {
      receiptUrl = await uploadReceipt(receiptFile);
    }

    const data = {
      year_month: yearMonth,
      source,
      description,
      amount,
      main_partner_id: mainPartnerId || null,
      receipt_url: receiptUrl,
    };

    if (editingId) {
      await supabase.from('revenue_entries').update(data).eq('id', editingId);
    } else {
      await supabase.from('revenue_entries').insert(data);
    }

    setModalOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 수익 항목을 삭제하시겠습니까?')) return;
    await supabase.from('revenue_entries').delete().eq('id', id);
    fetchData();
  };

  const handleExportCsv = () => {
    exportToCsv(`수익_${yearMonth}`, filteredRevenues, [
      { header: '수익원', accessor: (r) => REVENUE_SOURCES.find((s) => s.value === r.source)?.label || r.source },
      { header: '설명', accessor: (r) => r.description },
      { header: '금액', accessor: (r) => r.amount },
      { header: '메인 파트너', accessor: (r) => (r.main_partner as unknown as { display_name: string })?.display_name || '' },
      { header: '영수증', accessor: (r) => r.receipt_url || '' },
    ]);
  };

  const filteredRevenues = revenues.filter((r) => {
    if (filter && r.source !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.description.toLowerCase().includes(q) ||
        (REVENUE_SOURCES.find((s) => s.value === r.source)?.label || '').toLowerCase().includes(q);
    }
    return true;
  });

  const total = filteredRevenues.reduce((sum, r) => sum + r.amount, 0);
  const partnerOptions = partners.map((p) => ({ value: p.id, label: p.display_name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">수익 관리</h1>
        <div className="flex items-center gap-2">
          <MonthPicker value={yearMonth} onChange={setYearMonth} />
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition"
          >
            <Plus className="w-4 h-4" />
            추가
          </button>
        </div>
      </div>

      {/* 검색 + 필터 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="설명 검색..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setFilter('')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${filter === '' ? 'bg-[#E31837] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            전체
          </button>
          {REVENUE_SOURCES.map((src) => (
            <button key={src.value} type="button" onClick={() => setFilter(src.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${filter === src.value ? 'bg-[#E31837] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {src.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">{formatYearMonth(yearMonth)} 수익 내역</h2>
          <p className="text-lg font-bold text-[#E31837]">{formatKRW(total)}</p>
        </div>

        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : filteredRevenues.length === 0 ? (
          <div className="py-8 text-center text-gray-400">수익 데이터가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">수익원</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">설명</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">메인 파트너</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">금액</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">영수증</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">작업</th>
                </tr>
              </thead>
              <tbody>
                {filteredRevenues.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-600">
                        {REVENUE_SOURCES.find((s) => s.value === entry.source)?.label || entry.source}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-700">{entry.description}</td>
                    <td className="py-3 px-4 text-gray-500">
                      {(entry.main_partner as unknown as { display_name: string })?.display_name || '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-900">{formatKRW(entry.amount)}</td>
                    <td className="py-3 px-4 text-center">
                      {entry.receipt_url ? (
                        <a href={entry.receipt_url} target="_blank" rel="noopener noreferrer" className="text-[#E31837] hover:underline">
                          <Receipt className="w-4 h-4 inline" />
                        </a>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={() => openEdit(entry)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition" aria-label="수정">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => handleDelete(entry.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" aria-label="삭제">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 추가/수정 모달 */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title={editingId ? '수익 수정' : '수익 추가'}>
        <div className="space-y-4">
          <Select id="source" label="수익원" value={source} onChange={setSource} options={REVENUE_SOURCES} />
          <Input id="description" label="설명" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: PT 코칭 수수료" />
          <NumberInput id="amount" label="금액" value={amount} onChange={setAmount} />
          <Select id="mainPartner" label="메인 파트너 (5 배분)" value={mainPartnerId} onChange={setMainPartnerId} options={partnerOptions} placeholder="선택 (선택사항)" />

          {/* 영수증 첨부 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">영수증 첨부</label>
            {receiptPreview && !receiptFile && (
              <div className="mb-2">
                <a href={receiptPreview} target="_blank" rel="noopener noreferrer" className="text-sm text-[#E31837] hover:underline">기존 영수증 보기</a>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setReceiptFile(f);
                  setReceiptPreview(URL.createObjectURL(f));
                }
              }}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
            />
            {receiptFile && receiptPreview && (
              <img src={receiptPreview} alt="영수증 미리보기" className="mt-2 w-32 h-32 object-cover rounded-lg border" />
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); resetForm(); }}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition">
              취소
            </button>
            <button type="button" onClick={handleSave} disabled={!source || !description || amount <= 0}
              className="flex-1 py-2.5 bg-[#E31837] text-white rounded-lg hover:bg-[#c01530] text-sm font-medium transition disabled:opacity-50">
              {editingId ? '수정' : '추가'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
