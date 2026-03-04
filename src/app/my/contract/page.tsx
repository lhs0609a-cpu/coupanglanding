'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatPercent } from '@/lib/utils/format';
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from '@/lib/utils/constants';
import { CONTRACT_ARTICLES, renderArticleText } from '@/lib/data/contract-terms';
import type { ContractVariables } from '@/lib/data/contract-terms';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { FileText, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import type { Contract } from '@/lib/supabase/types';

function ContractContent({ vars }: { vars: ContractVariables }) {
  return (
    <div className="border border-gray-200 rounded-xl p-6 sm:p-8 space-y-6 bg-white">
      <div className="text-center border-b border-gray-200 pb-6">
        <h3 className="text-xl font-bold text-gray-900">쿠팡 셀러허브 PT 코칭 계약서</h3>
        <p className="text-sm text-gray-500 mt-1">전자계약서 (총 {CONTRACT_ARTICLES.length}조)</p>
      </div>

      <div className="space-y-5 text-sm leading-relaxed text-gray-700">
        {CONTRACT_ARTICLES.map((article) => (
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
  );
}

export default function MyContractPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signError, setSignError] = useState('');

  const supabase = useMemo(() => createClient(), []);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('contracts')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .order('created_at', { ascending: false });

    setContracts((data as Contract[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const handleSign = async (contractId: string) => {
    if (!agreed) {
      setSignError('계약 내용에 동의해주세요.');
      return;
    }
    setSigning(true);
    setSignError('');

    try {
      // 실제 IP 캡처
      let clientIp = 'unknown';
      try {
        const ipRes = await fetch('/api/ip');
        const ipData = await ipRes.json();
        clientIp = ipData.ip || 'unknown';
      } catch {
        // IP 캡처 실패 시 계속 진행
      }

      const { error } = await supabase
        .from('contracts')
        .update({
          status: 'signed',
          signed_at: new Date().toISOString(),
          signed_ip: clientIp,
        })
        .eq('id', contractId);

      if (error) throw error;

      setContracts((prev) =>
        prev.map((c) =>
          c.id === contractId
            ? { ...c, status: 'signed' as const, signed_at: new Date().toISOString(), signed_ip: clientIp }
            : c
        )
      );
      setAgreed(false);
    } catch {
      setSignError('서명 중 오류가 발생했습니다.');
    } finally {
      setSigning(false);
    }
  };

  const activeContract = contracts.find((c) => c.status === 'sent' || c.status === 'signed');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">계약서</h1>
      </div>

      {loading ? (
        <Card>
          <div className="text-center py-12 text-gray-400">불러오는 중...</div>
        </Card>
      ) : contracts.length === 0 ? (
        <Card>
          <div className="text-center py-16">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">아직 계약서가 없습니다</h3>
            <p className="text-gray-400">관리자가 계약서를 발송하면 여기에 표시됩니다.</p>
          </div>
        </Card>
      ) : (
        <>
          {activeContract && (
            <Card>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">현재 계약</h2>
                <Badge label={CONTRACT_STATUS_LABELS[activeContract.status]} colorClass={CONTRACT_STATUS_COLORS[activeContract.status]} />
              </div>

              {/* Contract Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="text-xs text-gray-500 mb-1">수수료율</div>
                  <div className="text-lg font-bold text-[#E31837]">{formatPercent(activeContract.share_percentage)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">시작일</div>
                  <div className="font-semibold">{activeContract.start_date}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">종료일</div>
                  <div className="font-semibold">{activeContract.end_date || '무기한'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">서명일</div>
                  <div className="font-semibold">{activeContract.signed_at ? formatDate(activeContract.signed_at) : '-'}</div>
                </div>
              </div>

              {/* 16조 계약서 내용 */}
              <ContractContent
                vars={{
                  share_percentage: activeContract.share_percentage,
                  start_date: activeContract.start_date,
                  end_date: activeContract.end_date,
                }}
              />

              {/* Sign Section */}
              {activeContract.status === 'sent' && (
                <div className="mt-6 p-5 bg-blue-50 border border-blue-100 rounded-xl">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-blue-800">
                      계약 내용을 충분히 확인하신 후 서명해주세요. 서명 후에는 변경할 수 없습니다.
                    </p>
                  </div>
                  <label className="flex items-center gap-3 mb-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => { setAgreed(e.target.checked); setSignError(''); }}
                      className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837]"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      위 계약 내용(총 {CONTRACT_ARTICLES.length}조)을 모두 확인하였으며, 이에 동의합니다.
                    </span>
                  </label>
                  {signError && <p className="text-sm text-red-600 mb-3">{signError}</p>}
                  <button
                    type="button"
                    onClick={() => handleSign(activeContract.id)}
                    disabled={signing || !agreed}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#E31837] text-white rounded-xl font-semibold hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {signing ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckCircle className="w-5 h-5" />
                    )}
                    {signing ? '서명 중...' : '전자 서명하기'}
                  </button>
                </div>
              )}

              {activeContract.status === 'signed' && (
                <div className="mt-6 p-5 bg-green-50 border border-green-100 rounded-xl flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-800">계약서 서명이 완료되었습니다.</p>
                    <p className="text-sm text-green-600">
                      서명일: {activeContract.signed_at ? formatDate(activeContract.signed_at) : ''}
                      {activeContract.signed_ip && ` | IP: ${activeContract.signed_ip}`}
                    </p>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Past Contracts */}
          {contracts.filter((c) => c.status !== 'sent' && c.status !== 'signed').length > 0 && (
            <Card>
              <h2 className="text-lg font-bold text-gray-900 mb-4">과거 계약 이력</h2>
              <div className="space-y-3">
                {contracts
                  .filter((c) => c.status !== 'sent' && c.status !== 'signed')
                  .map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div>
                        <div className="font-medium text-gray-700">
                          {c.start_date} ~ {c.end_date || '무기한'}
                        </div>
                        <div className="text-sm text-gray-500">수수료: {formatPercent(c.share_percentage)}</div>
                      </div>
                      <Badge label={CONTRACT_STATUS_LABELS[c.status]} colorClass={CONTRACT_STATUS_COLORS[c.status]} />
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
