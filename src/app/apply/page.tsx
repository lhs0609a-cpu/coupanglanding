'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, Phone, Send } from 'lucide-react';

const CATEGORY_OPTIONS = [
  { value: '의류', label: '의류/패션' },
  { value: '생활용품', label: '생활용품' },
  { value: '주방용품', label: '주방용품' },
  { value: '뷰티', label: '뷰티/화장품' },
  { value: '식품', label: '식품' },
  { value: '기타', label: '기타' },
];

const SITUATION_OPTIONS = [
  { value: '직장인', label: '직장인' },
  { value: '자영업', label: '자영업' },
  { value: '무직', label: '무직/구직중' },
  { value: '학생', label: '학생' },
  { value: '기타', label: '기타' },
];

const EXPERIENCE_OPTIONS = [
  { value: '없음', label: '없음 (처음이에요)' },
  { value: '1~3개월', label: '1~3개월' },
  { value: '3~6개월', label: '3~6개월' },
  { value: '6개월 이상', label: '6개월 이상' },
];

export default function ApplyPage() {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    category_interest: '',
    current_situation: '',
    coupang_experience: '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = '이름을 입력해주세요';
    if (!form.phone.trim()) {
      errs.phone = '연락처를 입력해주세요';
    } else if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(form.phone.replace(/\s/g, ''))) {
      errs.phone = '올바른 연락처를 입력해주세요 (예: 010-1234-5678)';
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = '올바른 이메일을 입력해주세요';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('applications').insert({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        category_interest: form.category_interest || null,
        current_situation: form.current_situation || null,
        coupang_experience: form.coupang_experience || null,
        message: form.message.trim() || null,
        source: 'pt',
      });

      if (error) throw error;
      setSubmitted(true);
    } catch {
      setErrors({ submit: '신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">신청이 완료되었습니다!</h1>
          <p className="text-gray-500 mb-2">48시간 내에 담당자가 연락드리겠습니다.</p>
          <p className="text-sm text-gray-400 mb-8">입력하신 연락처로 전화 또는 문자를 드립니다.</p>
          <Link
            href="/pt"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#E31837] text-white rounded-xl font-semibold hover:bg-[#c81530] transition"
          >
            <ArrowLeft className="w-4 h-4" />
            메인으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white">
        <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
          <Link href="/pt" className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm mb-6 transition">
            <ArrowLeft className="w-4 h-4" />
            돌아가기
          </Link>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-3">무료 상담 신청</h1>
          <p className="text-white/80 text-lg">쿠팡 판매를 시작하고 싶으시다면, 아래 정보를 남겨주세요.<br />전문가가 1:1로 상담해드립니다.</p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 -mt-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8 space-y-6">
          {errors.submit && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {errors.submit}
            </div>
          )}

          {/* 이름 */}
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-1.5">
              이름 <span className="text-[#E31837]">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="홍길동"
              className={`w-full px-4 py-3 border rounded-xl outline-none transition text-sm ${
                errors.name ? 'border-red-300 focus:ring-2 focus:ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-[#E31837]'
              } focus:border-transparent`}
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>

          {/* 연락처 */}
          <div>
            <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-1.5">
              연락처 <span className="text-[#E31837]">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="010-1234-5678"
                className={`w-full pl-10 pr-4 py-3 border rounded-xl outline-none transition text-sm ${
                  errors.phone ? 'border-red-300 focus:ring-2 focus:ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-[#E31837]'
                } focus:border-transparent`}
              />
            </div>
            {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
          </div>

          {/* 이메일 */}
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
              이메일 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="example@email.com"
              className={`w-full px-4 py-3 border rounded-xl outline-none transition text-sm ${
                errors.email ? 'border-red-300 focus:ring-2 focus:ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-[#E31837]'
              } focus:border-transparent`}
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
          </div>

          {/* 관심 카테고리 */}
          <div>
            <label htmlFor="category" className="block text-sm font-semibold text-gray-700 mb-1.5">
              관심 카테고리 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <select
              id="category"
              value={form.category_interest}
              onChange={(e) => updateField('category_interest', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none transition text-sm bg-white focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            >
              <option value="">선택해주세요</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 현재 상황 */}
          <div>
            <label htmlFor="situation" className="block text-sm font-semibold text-gray-700 mb-1.5">
              현재 상황 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <select
              id="situation"
              value={form.current_situation}
              onChange={(e) => updateField('current_situation', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none transition text-sm bg-white focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            >
              <option value="">선택해주세요</option>
              {SITUATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 쿠팡 판매 경험 */}
          <div>
            <label htmlFor="experience" className="block text-sm font-semibold text-gray-700 mb-1.5">
              쿠팡 판매 경험 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <select
              id="experience"
              value={form.coupang_experience}
              onChange={(e) => updateField('coupang_experience', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none transition text-sm bg-white focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            >
              <option value="">선택해주세요</option>
              {EXPERIENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 추가 메시지 */}
          <div>
            <label htmlFor="message" className="block text-sm font-semibold text-gray-700 mb-1.5">
              추가 메시지 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <textarea
              id="message"
              value={form.message}
              onChange={(e) => updateField('message', e.target.value)}
              placeholder="궁금한 점이나 요청사항을 자유롭게 작성해주세요"
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none transition text-sm resize-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white rounded-xl font-bold text-base shadow-lg shadow-red-200/40 hover:shadow-xl hover:shadow-red-300/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                신청 중...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                무료 상담 신청하기
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 text-center">
            개인정보는 상담 목적으로만 사용되며, 상담 종료 후 안전하게 폐기됩니다.
          </p>
        </form>
      </div>

      {/* Bottom spacing */}
      <div className="h-16" />
    </div>
  );
}
