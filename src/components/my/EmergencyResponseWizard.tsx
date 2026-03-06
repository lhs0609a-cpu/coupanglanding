'use client';

import { useState, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Modal from '@/components/ui/Modal';
import { findGuide, getGuidesByType } from '@/lib/data/emergency-responses';
import type { EmergencyGuide } from '@/lib/data/emergency-responses';
import { INCIDENT_SUBTYPE_LABELS, INCIDENT_SEVERITY_COLORS, INCIDENT_SEVERITY_LABELS } from '@/lib/utils/constants';
import {
  ShieldAlert, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight,
  Copy, Check, FileText, Shield, HelpCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

interface EmergencyResponseWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  initialType?: 'brand_complaint' | 'account_penalty';
}

const STEP_TITLES = [
  '상황 선택',
  '즉시 조치',
  '대응 템플릿',
  '재발 방지',
  '신고 완료',
];

const TOTAL_STEPS = STEP_TITLES.length;

export default function EmergencyResponseWizard({
  isOpen,
  onClose,
  onSubmitted,
  initialType,
}: EmergencyResponseWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState<'brand_complaint' | 'account_penalty' | null>(initialType || null);
  const [selectedSubType, setSelectedSubType] = useState<string | null>(null);
  const [immediateChecks, setImmediateChecks] = useState<boolean[]>([]);
  const [preventionChecks, setPreventionChecks] = useState<boolean[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [brandName, setBrandName] = useState('');
  const [productName, setProductName] = useState('');
  const [coupangReference, setCoupangReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const guide: EmergencyGuide | undefined = selectedType && selectedSubType
    ? findGuide(selectedType, selectedSubType)
    : undefined;

  const brandGuides = useMemo(() => getGuidesByType('brand_complaint'), []);
  const penaltyGuides = useMemo(() => getGuidesByType('account_penalty'), []);

  const selectSubType = useCallback((type: 'brand_complaint' | 'account_penalty', subType: string) => {
    setSelectedType(type);
    setSelectedSubType(subType);
    const g = findGuide(type, subType);
    if (g) {
      setImmediateChecks(new Array(g.immediateActions.length).fill(false));
      setPreventionChecks(new Array(g.preventionChecklist.length).fill(false));
    }
  }, []);

  const allUrgentChecked = guide
    ? guide.immediateActions.filter(a => a.urgent).every((_, i) => {
        const urgentIndices = guide.immediateActions
          .map((a, idx) => a.urgent ? idx : -1)
          .filter(idx => idx !== -1);
        return urgentIndices.every(idx => immediateChecks[idx]);
      })
    : false;

  const requiredPreventionDone = guide
    ? guide.preventionChecklist
        .map((item, idx) => item.required ? idx : -1)
        .filter(idx => idx !== -1)
        .every(idx => preventionChecks[idx])
    : false;

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return !!selectedType && !!selectedSubType;
      case 1: return allUrgentChecked;
      case 2: return true; // 템플릿은 선택사항
      case 3: return requiredPreventionDone;
      case 4: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
  };

  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSubmit = async () => {
    if (!guide || !selectedType || !selectedSubType) return;
    setSubmitting(true);
    setError('');

    try {
      const actionsText = guide.immediateActions
        .filter((_, i) => immediateChecks[i])
        .map(a => a.title)
        .join(', ');

      const res = await fetch('/api/emergency/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident_type: selectedType,
          sub_type: selectedSubType,
          severity: guide.severity,
          title: guide.title,
          description: description.trim() || null,
          brand_name: brandName.trim() || null,
          product_name: productName.trim() || null,
          coupang_reference: coupangReference.trim() || null,
          actions_taken: actionsText || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '신고에 실패했습니다.');
        setSubmitting(false);
        return;
      }

      onSubmitted();
      handleClose();
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep(0);
    setSelectedType(initialType || null);
    setSelectedSubType(null);
    setImmediateChecks([]);
    setPreventionChecks([]);
    setCopiedIndex(null);
    setDescription('');
    setBrandName('');
    setProductName('');
    setCoupangReference('');
    setError('');
    setExpandedFaq(null);
    onClose();
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">어떤 상황에 처해 있나요?</p>
            </div>

            {/* 브랜드 클레임 */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2">브랜드 클레임</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {brandGuides.map((g) => (
                  <button
                    key={g.subType}
                    type="button"
                    onClick={() => selectSubType('brand_complaint', g.subType)}
                    className={`text-left p-3 rounded-lg border-2 transition ${
                      selectedType === 'brand_complaint' && selectedSubType === g.subType
                        ? 'border-[#E31837] bg-red-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {INCIDENT_SUBTYPE_LABELS[g.subType] || g.subType}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${INCIDENT_SEVERITY_COLORS[g.severity]}`}>
                        {INCIDENT_SEVERITY_LABELS[g.severity]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">{g.summary}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 계정 페널티 */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2">계정 페널티</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {penaltyGuides.map((g) => (
                  <button
                    key={g.subType}
                    type="button"
                    onClick={() => selectSubType('account_penalty', g.subType)}
                    className={`text-left p-3 rounded-lg border-2 transition ${
                      selectedType === 'account_penalty' && selectedSubType === g.subType
                        ? 'border-[#E31837] bg-red-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {INCIDENT_SUBTYPE_LABELS[g.subType] || g.subType}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${INCIDENT_SEVERITY_COLORS[g.severity]}`}>
                        {INCIDENT_SEVERITY_LABELS[g.severity]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">{g.summary}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 1:
        if (!guide) return null;
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">아래 즉시 조치를 수행해주세요 (필수 항목 모두 체크)</p>
            </div>

            <div className="space-y-2">
              {guide.immediateActions.map((action, i) => (
                <label
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    action.urgent
                      ? immediateChecks[i] ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50'
                      : immediateChecks[i] ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={immediateChecks[i] || false}
                    onChange={(e) => {
                      const next = [...immediateChecks];
                      next[i] = e.target.checked;
                      setImmediateChecks(next);
                    }}
                    className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837] mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{action.title}</span>
                      {action.urgent && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">필수</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        );

      case 2:
        if (!guide) return null;
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
              <FileText className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">아래 템플릿을 복사하여 사용하세요</p>
            </div>

            {guide.responseTemplates.map((tmpl, i) => (
              <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tmpl.title}</p>
                    <p className="text-xs text-gray-500">대상: {tmpl.target}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(tmpl.body, i)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  >
                    {copiedIndex === i ? (
                      <>
                        <Check className="w-3 h-3 text-green-600" />
                        <span className="text-green-600">복사됨</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        복사
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-[200px] overflow-y-auto">
                  {tmpl.body}
                </pre>
              </div>
            ))}
          </div>
        );

      case 3:
        if (!guide) return null;
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-purple-700 bg-purple-50 px-3 py-2 rounded-lg">
              <Shield className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">재발 방지 체크리스트 (필수 항목 체크)</p>
            </div>

            <div className="space-y-2">
              {guide.preventionChecklist.map((item, i) => (
                <label
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    item.required
                      ? preventionChecks[i] ? 'border-green-300 bg-green-50' : 'border-orange-200 bg-orange-50'
                      : preventionChecks[i] ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={preventionChecks[i] || false}
                    onChange={(e) => {
                      const next = [...preventionChecks];
                      next[i] = e.target.checked;
                      setPreventionChecks(next);
                    }}
                    className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837] mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{item.title}</span>
                      {item.required && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">필수</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* 에스컬레이션 기준 */}
            {guide.escalationCriteria.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs font-bold text-red-700 mb-1">에스컬레이션 기준 (아래 해당 시 관리자 즉시 보고)</p>
                <ul className="space-y-1">
                  {guide.escalationCriteria.map((c, i) => (
                    <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

      case 4:
        if (!guide) return null;
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">상세 내용을 입력하고 신고를 완료하세요 (선택)</p>
            </div>

            {selectedType === 'brand_complaint' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">브랜드명</label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                  placeholder="예: 나이키, 애플"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">관련 상품명</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                placeholder="예: OO 브랜드 런닝화"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">쿠팡 참조번호</label>
              <input
                type="text"
                value={coupangReference}
                onChange={(e) => setCoupangReference(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                placeholder="쿠팡 경고 번호, 주문번호 등"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">상세 설명</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent resize-none"
                placeholder="상황에 대한 추가 설명을 입력하세요"
              />
            </div>

            {/* FAQ */}
            {guide.faqs.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4" />
                  자주 묻는 질문
                </h4>
                <div className="space-y-1">
                  {guide.faqs.map((faq, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition"
                      >
                        <span className="text-sm text-gray-900">{faq.question}</span>
                        {expandedFaq === i ? (
                          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                        )}
                      </button>
                      {expandedFaq === i && (
                        <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
                          <p className="text-xs text-gray-600">{faq.answer}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="긴급 대응 위자드"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-1.5">
          {STEP_TITLES.map((title, i) => (
            <div key={title} className="flex items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                  i < step
                    ? 'bg-green-500 text-white'
                    : i === step
                    ? 'bg-[#E31837] text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              {i < TOTAL_STEPS - 1 && (
                <div className={`w-4 h-0.5 ${i < step ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Title */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            {step + 1}/{TOTAL_STEPS}단계
          </p>
          <h3 className="text-sm font-bold text-gray-900">{STEP_TITLES[step]}</h3>
          {guide && step > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">{guide.title}</p>
          )}
        </div>

        {/* Step Content */}
        <div className="min-h-[200px] max-h-[60vh] overflow-y-auto">
          {renderStepContent()}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2 border-t border-gray-200">
          <button
            type="button"
            onClick={step === 0 ? handleClose : handlePrev}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? '취소' : '이전'}
          </button>

          {step < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  신고 중...
                </>
              ) : (
                '신고 완료'
              )}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
