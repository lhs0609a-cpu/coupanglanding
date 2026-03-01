'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatPercent } from '@/lib/utils/format';
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { FileText, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import type { Contract } from '@/lib/supabase/types';

export default function MyContractPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signError, setSignError] = useState('');

  const supabase = createClient();

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    // Get current user's pt_user_id
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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
      const { error } = await supabase
        .from('contracts')
        .update({
          status: 'signed',
          signed_at: new Date().toISOString(),
          signed_ip: 'client',
        })
        .eq('id', contractId);

      if (error) throw error;

      setContracts((prev) =>
        prev.map((c) =>
          c.id === contractId
            ? { ...c, status: 'signed' as const, signed_at: new Date().toISOString() }
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
          {/* Active Contract */}
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

              {/* Contract Content */}
              <div className="border border-gray-200 rounded-xl p-6 sm:p-8 space-y-6 bg-white">
                <div className="text-center border-b border-gray-200 pb-6">
                  <h3 className="text-xl font-bold text-gray-900">쿠팡 셀러허브 PT 코칭 계약서</h3>
                  <p className="text-sm text-gray-500 mt-1">전자계약서</p>
                </div>

                <div className="space-y-5 text-sm leading-relaxed text-gray-700">
                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">제1조 (목적)</h4>
                    <p>본 계약은 쿠팡 셀러허브(이하 &quot;회사&quot;)가 PT 회원(이하 &quot;회원&quot;)에게 쿠팡 온라인 판매 코칭 서비스를 제공함에 있어 양 당사자의 권리와 의무를 규정함을 목적으로 합니다.</p>
                  </div>

                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">제2조 (서비스 내용)</h4>
                    <p>회사는 회원에게 다음 서비스를 제공합니다:</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      <li>데이터 기반 상품 선정 및 소싱 컨설팅</li>
                      <li>AI 자동화 도구를 활용한 상품 등록 지원</li>
                      <li>쿠팡 광고 관리 및 최적화 가이드</li>
                      <li>정기적인 1:1 코칭 세션</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">제3조 (비용)</h4>
                    <p>초기 비용은 <strong>0원</strong>이며, 회원의 쿠팡 순이익 중 <strong>{formatPercent(activeContract.share_percentage)}</strong>를 수수료로 지급합니다. 순이익이 발생하지 않는 달에는 수수료가 없습니다.</p>
                  </div>

                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">제4조 (정산)</h4>
                    <p>정산은 매월 1회 진행되며, 회원은 월별 매출을 보고합니다. 회사는 상세 리포트를 제공하며, 수수료는 순이익 기준으로 계산됩니다.</p>
                  </div>

                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">제5조 (계약 기간)</h4>
                    <p>본 계약은 {activeContract.start_date}부터 시작되며, {activeContract.end_date ? `${activeContract.end_date}까지 유효합니다.` : '별도 해지 통보가 없는 한 자동 연장됩니다.'} 양 당사자는 30일 전 서면 통보로 자유롭게 해지할 수 있습니다.</p>
                  </div>

                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">제6조 (보장)</h4>
                    <p>코칭 시작 후 3개월 내 매출이 발생하지 않을 경우, 수수료는 <strong>0원</strong>입니다. 회원에게 일체의 비용 부담이 없습니다.</p>
                  </div>

                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">제7조 (비밀유지)</h4>
                    <p>양 당사자는 본 계약 과정에서 알게 된 상대방의 사업 정보, 전략, 기술 등을 제3자에게 공개하지 않습니다.</p>
                  </div>
                </div>
              </div>

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
                      위 계약 내용을 모두 확인하였으며, 이에 동의합니다.
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
                    <p className="text-sm text-green-600">서명일: {activeContract.signed_at ? formatDate(activeContract.signed_at) : ''}</p>
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
