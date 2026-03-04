'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, getCurrentYearMonth, formatYearMonth } from '@/lib/utils/format';
import { EXPENSE_CATEGORIES } from '@/lib/utils/constants';
import { exportToCsv } from '@/lib/utils/csv-export';
import MonthPicker from '@/components/ui/MonthPicker';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import NumberInput from '@/components/ui/NumberInput';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Plus, Pencil, Trash2, Download, Search, Receipt, RefreshCw } from 'lucide-react';
import type { ExpenseEntry, Partner, RecurringExpense } from '@/lib/supabase/types';

export default function AdminExpensesPage() {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [paidByPartnerId, setPaidByPartnerId] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // 반복 비용 폼
  const [rcCategory, setRcCategory] = useState('');
  const [rcDescription, setRcDescription] = useState('');
  const [rcAmount, setRcAmount] = useState(0);
  const [rcPartnerId, setRcPartnerId] = useState('');

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [expRes, partnerRes, rcRes] = await Promise.all([
      supabase.from('expense_entries').select('*, paid_by_partner:partners(display_name)').eq('year_month', yearMonth).order('created_at', { ascending: false }),
      supabase.from('partners').select('*'),
      supabase.from('recurring_expenses').select('*, paid_by_partner:partners(display_name)').eq('is_active', true),
    ]);
    setExpenses((expRes.data as ExpenseEntry[]) || []);
    setPartners((partnerRes.data as Partner[]) || []);
    setRecurringExpenses((rcRes.data as RecurringExpense[]) || []);
    setLoading(false);
  }, [yearMonth, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setCategory(''); setDescription(''); setAmount(0); setPaidByPartnerId('');
    setReceiptFile(null); setReceiptPreview(null); setEditingId(null);
  };

  const openAdd = () => { resetForm(); setModalOpen(true); };

  const openEdit = (entry: ExpenseEntry) => {
    setEditingId(entry.id); setCategory(entry.category); setDescription(entry.description);
    setAmount(entry.amount); setPaidByPartnerId(entry.paid_by_partner_id || '');
    setReceiptPreview(entry.receipt_url || null); setReceiptFile(null); setModalOpen(true);
  };

  const uploadReceipt = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `expense/${yearMonth}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('receipts').upload(path, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from('receipts').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSave = async () => {
    let receiptUrl = receiptPreview;
    if (receiptFile) { receiptUrl = await uploadReceipt(receiptFile); }
    const data = { year_month: yearMonth, category, description, amount, paid_by_partner_id: paidByPartnerId || null, receipt_url: receiptUrl };
    if (editingId) { await supabase.from('expense_entries').update(data).eq('id', editingId); }
    else { await supabase.from('expense_entries').insert(data); }
    setModalOpen(false); resetForm(); fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 비용 항목을 삭제하시겠습니까?')) return;
    await supabase.from('expense_entries').delete().eq('id', id);
    fetchData();
  };

  // 반복 비용 일괄 적용
  const handleApplyRecurring = async () => {
    if (!confirm(`${formatYearMonth(yearMonth)}에 반복 비용 ${recurringExpenses.length}건을 적용하시겠습니까?`)) return;
    const rows = recurringExpenses.map((rc) => ({
      year_month: yearMonth,
      category: rc.category,
      description: `[반복] ${rc.description}`,
      amount: rc.amount,
      paid_by_partner_id: rc.paid_by_partner_id,
    }));
    await supabase.from('expense_entries').insert(rows);
    fetchData();
  };

  // 반복 비용 저장
  const handleSaveRecurring = async () => {
    await supabase.from('recurring_expenses').insert({
      category: rcCategory, description: rcDescription, amount: rcAmount,
      paid_by_partner_id: rcPartnerId || null,
    });
    setRecurringModalOpen(false);
    setRcCategory(''); setRcDescription(''); setRcAmount(0); setRcPartnerId('');
    fetchData();
  };

  const handleDeleteRecurring = async (id: string) => {
    await supabase.from('recurring_expenses').update({ is_active: false }).eq('id', id);
    fetchData();
  };

  const handleExportCsv = () => {
    exportToCsv(`비용_${yearMonth}`, filteredExpenses, [
      { header: '카테고리', accessor: (e) => EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label || e.category },
      { header: '설명', accessor: (e) => e.description },
      { header: '금액', accessor: (e) => e.amount },
      { header: '지불 파트너', accessor: (e) => (e.paid_by_partner as unknown as { display_name: string })?.display_name || '' },
      { header: '영수증', accessor: (e) => e.receipt_url || '' },
    ]);
  };

  const filteredExpenses = expenses.filter((e) => {
    if (filter && e.category !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return e.description.toLowerCase().includes(q);
    }
    return true;
  });

  const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const partnerOptions = partners.map((p) => ({ value: p.id, label: p.display_name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">비용 관리</h1>
        <div className="flex items-center gap-2">
          <MonthPicker value={yearMonth} onChange={setYearMonth} />
          <button type="button" onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button type="button" onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition">
            <Plus className="w-4 h-4" /> 추가
          </button>
        </div>
      </div>

      {/* 반복 비용 섹션 */}
      {recurringExpenses.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> 반복 비용 템플릿
            </h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRecurringModalOpen(true)}
                className="text-xs text-[#E31837] hover:underline font-medium">+ 추가</button>
              <button type="button" onClick={handleApplyRecurring}
                className="text-xs px-3 py-1 bg-[#E31837] text-white rounded-lg hover:bg-[#c01530] transition font-medium">
                이번 달 일괄 적용
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {recurringExpenses.map((rc) => (
              <div key={rc.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 bg-gray-200 rounded text-xs">{EXPENSE_CATEGORIES.find((c) => c.value === rc.category)?.label}</span>
                  <span className="text-gray-700">{rc.description}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{formatKRW(rc.amount)}</span>
                  <button type="button" onClick={() => handleDeleteRecurring(rc.id)}
                    className="text-gray-400 hover:text-red-500 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {recurringExpenses.length === 0 && (
        <button type="button" onClick={() => setRecurringModalOpen(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-[#E31837] hover:text-[#E31837] transition flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4" /> 반복 비용 템플릿 추가
        </button>
      )}

      {/* 검색 + 필터 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="설명 검색..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setFilter('')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${filter === '' ? 'bg-[#E31837] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>전체</button>
          {EXPENSE_CATEGORIES.map((cat) => (
            <button key={cat.value} type="button" onClick={() => setFilter(cat.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${filter === cat.value ? 'bg-[#E31837] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{cat.label}</button>
          ))}
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">{formatYearMonth(yearMonth)} 비용 내역</h2>
          <p className="text-lg font-bold text-red-600">{formatKRW(total)}</p>
        </div>

        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : filteredExpenses.length === 0 ? (
          <div className="py-8 text-center text-gray-400">비용 데이터가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">카테고리</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">설명</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">지불 파트너</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">금액</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">영수증</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">작업</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-600">
                        {EXPENSE_CATEGORIES.find((c) => c.value === entry.category)?.label || entry.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-700">{entry.description}</td>
                    <td className="py-3 px-4 text-gray-500">
                      {(entry.paid_by_partner as unknown as { display_name: string })?.display_name || '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-900">{formatKRW(entry.amount)}</td>
                    <td className="py-3 px-4 text-center">
                      {entry.receipt_url ? (
                        <a href={entry.receipt_url} target="_blank" rel="noopener noreferrer" className="text-[#E31837] hover:underline">
                          <Receipt className="w-4 h-4 inline" />
                        </a>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={() => openEdit(entry)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition"><Pencil className="w-4 h-4" /></button>
                        <button type="button" onClick={() => handleDelete(entry.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 비용 추가/수정 모달 */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title={editingId ? '비용 수정' : '비용 추가'}>
        <div className="space-y-4">
          <Select id="category" label="카테고리" value={category} onChange={setCategory} options={EXPENSE_CATEGORIES} />
          <Input id="description" label="설명" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: Vercel Pro 월 구독" />
          <NumberInput id="amount" label="금액" value={amount} onChange={setAmount} />
          <Select id="paidBy" label="지불 파트너" value={paidByPartnerId} onChange={setPaidByPartnerId} options={partnerOptions} placeholder="누가 지불했는지 선택" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">영수증 첨부</label>
            {receiptPreview && !receiptFile && (
              <div className="mb-2"><a href={receiptPreview} target="_blank" rel="noopener noreferrer" className="text-sm text-[#E31837] hover:underline">기존 영수증 보기</a></div>
            )}
            <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setReceiptFile(f); setReceiptPreview(URL.createObjectURL(f)); } }}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); resetForm(); }}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition">취소</button>
            <button type="button" onClick={handleSave} disabled={!category || !description || amount <= 0}
              className="flex-1 py-2.5 bg-[#E31837] text-white rounded-lg hover:bg-[#c01530] text-sm font-medium transition disabled:opacity-50">{editingId ? '수정' : '추가'}</button>
          </div>
        </div>
      </Modal>

      {/* 반복 비용 추가 모달 */}
      <Modal isOpen={recurringModalOpen} onClose={() => setRecurringModalOpen(false)} title="반복 비용 템플릿 추가">
        <div className="space-y-4">
          <Select id="rcCategory" label="카테고리" value={rcCategory} onChange={setRcCategory} options={EXPENSE_CATEGORIES} />
          <Input id="rcDesc" label="설명" value={rcDescription} onChange={(e) => setRcDescription(e.target.value)} placeholder="예: Vercel Pro 월 구독" />
          <NumberInput id="rcAmount" label="금액" value={rcAmount} onChange={setRcAmount} />
          <Select id="rcPartner" label="지불 파트너" value={rcPartnerId} onChange={setRcPartnerId} options={partnerOptions} placeholder="선택" />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setRecurringModalOpen(false)}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition">취소</button>
            <button type="button" onClick={handleSaveRecurring} disabled={!rcCategory || !rcDescription || rcAmount <= 0}
              className="flex-1 py-2.5 bg-[#E31837] text-white rounded-lg hover:bg-[#c01530] text-sm font-medium transition disabled:opacity-50">추가</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
