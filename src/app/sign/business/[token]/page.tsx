'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getContractArticles, renderArticleText } from '@/lib/data/contract-terms';
import type { ContractVariables } from '@/lib/data/contract-terms';
import SignaturePad from '@/components/ui/SignaturePad';
import { FileText, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface ContractInfo {
  contractId: string;
  sharePercentage: number;
  startDate: string;
  endDate: string | null;
  operatorName: string;
  businessName: string | null;
  businessRepresentative: string | null;
  operatorSignedAt: string | null;
}

export default function BusinessSignPage() {
  const params = useParams();
  const token = params.token as string;

  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [signerName, setSignerName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState('');
  const [completed, setCompleted] = useState(false);

  const fetchContract = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/sign-business?token=${encodeURIComponent(token)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '계약 정보를 불러올 수 없습니다.');
        return;
      }

      setContractInfo(data);
      if (data.businessRepresentative) {
        setSignerName(data.businessRepresentative);
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchContract();
  }, [token, fetchContract]);

  const handleSign = async () => {
    if (!signerName.trim()) {
      setSignError('서명자 이름을 입력해주세요.');
      return;
    }
    if (!agreed) {
      setSignError('계약 내용에 동의해주세요.');
      return;
    }
    if (!signatureData) {
      setSignError('서명란에 자필 서명을 해주세요.');
      return;
    }

    setSigning(true);
    setSignError('');

    try {
      const res = await fetch('/api/contracts/sign-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signerName: signerName.trim(), signatureData }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '서명 실패');

      setCompleted(true);
    } catch (err) {
      setSignError(err instanceof Error ? err.message : '서명 중 오류가 발생했습니다.');
    } finally {
      setSigning(false);
    }
  };

  // 에러 화면
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">서명 링크 오류</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  // 로딩
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-[#E31837] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">계약 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 서명 완료 화면
  if (completed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">서명이 완료되었습니다</h1>
          <p className="text-gray-600 mb-4">
            3자 계약서에 대한 사업자 대표 서명이 정상적으로 처리되었습니다.
            계약이 체결되었습니다.
          </p>
          <p className="text-sm text-gray-500">이 페이지를 닫으셔도 됩니다.</p>
        </div>
      </div>
    );
  }

  if (!contractInfo) return null;

  const vars: ContractVariables = {
    share_percentage: contractInfo.sharePercentage,
    start_date: contractInfo.startDate,
    end_date: contractInfo.endDate,
    contract_mode: 'triple',
    operator_name: contractInfo.operatorName,
    business_rep_name: signerName || contractInfo.businessRepresentative || undefined,
  };

  const articles = getContractArticles('triple');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-[#E31837]" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">사업자 대표 서명</h1>
              <p className="text-xs text-gray-500">3자 계약서 — 쿠팡 셀러허브 PT 코칭</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* 계약 요약 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">계약 요약</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">회사</span>
              <p className="font-semibold text-gray-900">쿠팡 셀러허브</p>
            </div>
            <div>
              <span className="text-gray-500">실운영자 (병)</span>
              <p className="font-semibold text-gray-900">{contractInfo.operatorName}</p>
            </div>
            <div>
              <span className="text-gray-500">수수료율</span>
              <p className="font-semibold text-[#E31837]">{contractInfo.sharePercentage}%</p>
            </div>
            <div>
              <span className="text-gray-500">계약 기간</span>
              <p className="font-semibold text-gray-900">
                {contractInfo.startDate} ~ {contractInfo.endDate || '무기한'}
              </p>
            </div>
            {contractInfo.businessName && (
              <div>
                <span className="text-gray-500">사업자 상호</span>
                <p className="font-semibold text-gray-900">{contractInfo.businessName}</p>
              </div>
            )}
            {contractInfo.operatorSignedAt && (
              <div>
                <span className="text-gray-500">운영자 서명일</span>
                <p className="font-semibold text-gray-900">
                  {new Date(contractInfo.operatorSignedAt).toLocaleDateString('ko-KR')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 3자 계약 전문 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 space-y-5">
          <div className="text-center border-b border-gray-200 pb-5">
            <h3 className="text-xl font-bold text-gray-900">쿠팡 셀러허브 PT 코칭 3자 계약서</h3>
            <p className="text-sm text-gray-500 mt-1">전자계약서 (총 {articles.length}조)</p>
          </div>

          <div className="space-y-5 text-sm leading-relaxed text-gray-700">
            {articles.map((article) => (
              <div key={article.number}>
                <h4 className="font-bold text-gray-900 mb-2">
                  제{article.number}조 ({article.title})
                </h4>
                {article.paragraphs.map((p, i) => (
                  <p key={i} className={i > 0 ? 'mt-1.5' : ''}>
                    {renderArticleText(p, vars)}
                  </p>
                ))}
                {article.subItems && (
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    {article.subItems.map((item, i) => (
                      <li key={i}>
                        {item.label !== String(i + 1) && (
                          <span className="font-medium">{item.label}: </span>
                        )}
                        {renderArticleText(item.text, vars)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 서명 섹션 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-base font-bold text-gray-900">사업자 대표 서명</h2>

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-800">
                사업자등록 명의인으로서 계약 내용을 확인하고 서명하시면 3자 계약이 체결됩니다.
                을(사업자)과 병(운영자)은 본 계약의 모든 의무에 대해 연대책임을 집니다.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="signer-name" className="block text-sm font-medium text-gray-700 mb-1">
              사업자 대표 이름 <span className="text-red-500">*</span>
            </label>
            <input
              id="signer-name"
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="이름을 입력해주세요"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => { setAgreed(e.target.checked); setSignError(''); }}
              className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837]"
            />
            <span className="text-sm font-medium text-gray-700">
              위 계약 내용(총 {articles.length}조)을 모두 확인하였으며, 사업자 대표로서 이에 동의합니다.
            </span>
          </label>

          {agreed && (
            <div>
              <SignaturePad
                onSignatureChange={(data) => { setSignatureData(data); setSignError(''); }}
                disabled={signing}
              />
            </div>
          )}

          {signError && <p className="text-sm text-red-600">{signError}</p>}

          <button
            type="button"
            onClick={handleSign}
            disabled={signing || !agreed || !signatureData || !signerName.trim()}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#E31837] text-white rounded-xl font-semibold hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signing ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <CheckCircle className="w-5 h-5" />
            )}
            {signing ? '서명 중...' : '사업자 대표 서명 완료'}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <p className="text-xs text-gray-400">쿠팡 셀러허브 PT 코칭 서비스</p>
      </div>
    </div>
  );
}
