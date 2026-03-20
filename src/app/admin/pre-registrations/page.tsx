'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { PreRegistration } from '@/lib/supabase/types';
import { PRE_REG_STATUS_LABELS, PRE_REG_STATUS_COLORS } from '@/lib/utils/constants';
import { Plus, X, UserPlus } from 'lucide-react';

export default function AdminPreRegistrationsPage() {
  const [items, setItems] = useState<PreRegistration[]>([]);
  const [loading, setLoading] = useState(true);

  // 추가 모달
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addShare, setAddShare] = useState(30);
  const [addMemo, setAddMemo] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pre-registrations');
      if (!res.ok) throw new Error();
      const json = await res.json();
      setItems(json.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    const total = items.length;
    const pending = items.filter(i => i.status === 'pending').length;
    const used = items.filter(i => i.status === 'used').length;
    const cancelled = items.filter(i => i.status === 'cancelled').length;
    return { total, pending, used, cancelled };
  }, [items]);

  const handleAdd = async () => {
    if (!addEmail.trim() || !addName.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/admin/pre-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: addEmail.trim(),
          full_name: addName.trim(),
          phone: addPhone.trim() || undefined,
          share_percentage: addShare,
          memo: addMemo.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddError(json.error || '생성에 실패했습니다.');
        return;
      }
      setShowAdd(false);
      setAddEmail('');
      setAddName('');
      setAddPhone('');
      setAddShare(30);
      setAddMemo('');
      fetchData();
    } catch {
      setAddError('생성에 실패했습니다.');
    } finally {
      setAdding(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('이 사전등록을 취소하시겠습니까?')) return;
    try {
      const res = await fetch('/api/admin/pre-registrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'cancelled' }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || '취소에 실패했습니다.');
        return;
      }
      fetchData();
    } catch {
      alert('취소에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E31837]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">사전등록 관리</h1>
          <p className="text-sm text-gray-500 mt-1">가입 가능한 이메일을 미리 등록합니다</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#E31837] text-white rounded-lg hover:bg-[#c01530] transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          사전등록 추가
        </button>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '전체', value: stats.total, color: 'text-gray-900' },
          { label: '대기중', value: stats.pending, color: 'text-blue-600' },
          { label: '가입완료', value: stats.used, color: 'text-green-600' },
          { label: '취소', value: stats.cancelled, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">이메일</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">이름</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">연락처</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700">수수료율</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700">상태</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">등록일</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">메모</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    등록된 사전등록이 없습니다
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{item.email}</td>
                    <td className="px-4 py-3">{item.full_name}</td>
                    <td className="px-4 py-3 text-gray-500">{item.phone || '-'}</td>
                    <td className="px-4 py-3 text-center">{item.share_percentage}%</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PRE_REG_STATUS_COLORS[item.status] || ''}`}>
                        {PRE_REG_STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(item.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{item.memo || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      {item.status === 'pending' && (
                        <button
                          onClick={() => handleCancel(item.id)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          취소
                        </button>
                      )}
                      {item.status === 'used' && (
                        <span className="text-xs text-gray-400">
                          {item.used_at ? new Date(item.used_at).toLocaleDateString('ko-KR') : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 추가 모달 */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold">사전등록 추가</h3>
              <button onClick={() => { setShowAdd(false); setAddError(''); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일 *</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={e => setAddEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none text-sm"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
                <input
                  type="text"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none text-sm"
                  placeholder="홍길동"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
                <input
                  type="tel"
                  value={addPhone}
                  onChange={e => setAddPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none text-sm"
                  placeholder="010-1234-5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">수수료율 (%)</label>
                <input
                  type="number"
                  value={addShare}
                  onChange={e => setAddShare(Number(e.target.value))}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                <textarea
                  value={addMemo}
                  onChange={e => setAddMemo(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none text-sm resize-none"
                  placeholder="참고 사항"
                />
              </div>

              {addError && (
                <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{addError}</div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-gray-200">
              <button
                onClick={() => { setShowAdd(false); setAddError(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleAdd}
                disabled={adding || !addEmail.trim() || !addName.trim()}
                className="px-4 py-2 text-sm bg-[#E31837] text-white rounded-lg hover:bg-[#c01530] disabled:opacity-50 font-medium"
              >
                {adding ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
