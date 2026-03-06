'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import type { BrandBlacklist } from '@/lib/supabase/types';
import type { BlacklistRiskLevel, ComplaintType } from '@/lib/supabase/types';
import {
  BLACKLIST_RISK_LABELS, COMPLAINT_TYPE_LABELS,
} from '@/lib/utils/constants';

interface BlacklistManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: BrandBlacklist | null;
  onSaved: () => void;
}

export default function BlacklistManageModal({
  isOpen,
  onClose,
  item,
  onSaved,
}: BlacklistManageModalProps) {
  const isEdit = !!item;

  const [brandName, setBrandName] = useState(item?.brand_name || '');
  const [brandNameEn, setBrandNameEn] = useState(item?.brand_name_en || '');
  const [category, setCategory] = useState(item?.category || '');
  const [riskLevel, setRiskLevel] = useState<BlacklistRiskLevel>(item?.risk_level || 'warning');
  const [complaintType, setComplaintType] = useState<ComplaintType>(item?.complaint_type || 'trademark');
  const [description, setDescription] = useState(item?.description || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!brandName.trim()) {
      setError('브랜드명을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        ...(isEdit ? { id: item!.id } : {}),
        brand_name: brandName.trim(),
        brand_name_en: brandNameEn.trim() || null,
        category: category.trim() || null,
        risk_level: riskLevel,
        complaint_type: complaintType,
        description: description.trim() || null,
      };

      const res = await fetch('/api/emergency/blacklist', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '저장에 실패했습니다.');
        setLoading(false);
        return;
      }

      onSaved();
      handleClose();
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setBrandName(item?.brand_name || '');
    setBrandNameEn(item?.brand_name_en || '');
    setCategory(item?.category || '');
    setRiskLevel(item?.risk_level || 'warning');
    setComplaintType(item?.complaint_type || 'trademark');
    setDescription(item?.description || '');
    setError('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? '블랙리스트 수정' : '블랙리스트 추가'}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              브랜드명 (한글) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              placeholder="예: 나이키"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              브랜드명 (영문)
            </label>
            <input
              type="text"
              value={brandNameEn}
              onChange={(e) => setBrandNameEn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              placeholder="예: Nike"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            placeholder="예: 패션, 전자제품"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">위험도</label>
            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value as BlacklistRiskLevel)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            >
              {Object.entries(BLACKLIST_RISK_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">클레임 유형</label>
            <select
              value={complaintType}
              onChange={(e) => setComplaintType(e.target.value as ComplaintType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            >
              {Object.entries(COMPLAINT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent resize-none"
            placeholder="브랜드에 대한 참고사항을 입력하세요"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !brandName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : null}
            {loading ? '저장 중...' : isEdit ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
