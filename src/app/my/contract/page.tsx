'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatPercent } from '@/lib/utils/format';
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from '@/lib/utils/constants';
import { CONTRACT_ARTICLES, renderArticleText } from '@/lib/data/contract-terms';
import type { ContractVariables } from '@/lib/data/contract-terms';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import SignaturePad from '@/components/ui/SignaturePad';
import FileUpload from '@/components/ui/FileUpload';
import WithdrawalWizard from '@/components/my/WithdrawalWizard';
import { FileText, CheckCircle, Clock, AlertTriangle, Calendar, Upload, LogOut } from 'lucide-react';
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
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signError, setSignError] = useState('');
  // 해지 관련 state
  const [ackLoading, setAckLoading] = useState(false);
  const [ackChecked, setAckChecked] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreviewUrl, setEvidencePreviewUrl] = useState<string | null>(null);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [terminationMessage, setTerminationMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // 탈퇴 요청 관련 state
  const [showWithdrawalWizard, setShowWithdrawalWizard] = useState(false);

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
    if (!signatureData) {
      setSignError('아래 서명란에 자필 서명을 해주세요.');
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
          signature_data: signatureData,
        })
        .eq('id', contractId);

      if (error) throw error;

      setContracts((prev) =>
        prev.map((c) =>
          c.id === contractId
            ? {
                ...c,
                status: 'signed' as const,
                signed_at: new Date().toISOString(),
                signed_ip: clientIp,
                signature_data: signatureData,
              }
            : c
        )
      );
      setAgreed(false);
      setSignatureData(null);
    } catch {
      setSignError('서명 중 오류가 발생했습니다.');
    } finally {
      setSigning(false);
    }
  };

  const handleAcknowledge = async (contractId: string) => {
    setAckLoading(true);
    setTerminationMessage(null);
    try {
      const res = await fetch('/api/contracts/acknowledge-termination', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTerminationMessage({ type: 'error', text: data.error || '확인 처리에 실패했습니다.' });
      } else {
        setContracts((prev) =>
          prev.map((c) =>
            c.id === contractId ? { ...c, termination_acknowledged_at: new Date().toISOString() } : c
          )
        );
        setTerminationMessage({ type: 'success', text: '확인이 완료되었습니다.' });
      }
    } catch {
      setTerminationMessage({ type: 'error', text: '서버 오류가 발생했습니다.' });
    } finally {
      setAckLoading(false);
    }
  };

  const handleEvidenceUpload = async (contractId: string) => {
    if (!evidenceFile) return;
    setEvidenceUploading(true);
    setTerminationMessage(null);

    try {
      // pt_user 정보 가져오기
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: ptUser } = await supabase
        .from('pt_users')
        .select('id')
        .eq('profile_id', user.id)
        .single();
      if (!ptUser) return;

      // 파일 업로드
      const formData = new FormData();
      formData.append('file', evidenceFile);
      formData.append('ptUserId', ptUser.id);
      formData.append('yearMonth', 'deactivation');
      formData.append('type', 'revenue');
      const uploadRes = await fetch('/api/upload-screenshot', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        setTerminationMessage({ type: 'error', text: uploadData.error || '업로드에 실패했습니다.' });
        return;
      }

      // 증빙 URL 저장
      const res = await fetch('/api/contracts/submit-deactivation-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, evidenceUrl: uploadData.url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTerminationMessage({ type: 'error', text: data.error || '증빙 제출에 실패했습니다.' });
      } else {
        setContracts((prev) =>
          prev.map((c) =>
            c.id === contractId ? { ...c, product_deactivation_evidence_url: uploadData.url } : c
          )
        );
        setTerminationMessage({ type: 'success', text: '증빙이 제출되었습니다. 관리자가 확인 후 처리합니다.' });
      }
    } catch {
      setTerminationMessage({ type: 'error', text: '서버 오류가 발생했습니다.' });
    } finally {
      setEvidenceUploading(false);
    }
  };

  const activeContract = contracts.find((c) => c.status === 'sent' || c.status === 'signed');
  const terminatedContract = contracts.find((c) => c.status === 'terminated');

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

                  {/* 자필 서명 패드 */}
                  {agreed && (
                    <div className="mb-4">
                      <SignaturePad
                        onSignatureChange={(data) => { setSignatureData(data); setSignError(''); }}
                        disabled={signing}
                      />
                    </div>
                  )}

                  {signError && <p className="text-sm text-red-600 mb-3">{signError}</p>}
                  <button
                    type="button"
                    onClick={() => handleSign(activeContract.id)}
                    disabled={signing || !agreed || !signatureData}
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
                <>
                  <div className="mt-6 p-5 bg-green-50 border border-green-100 rounded-xl">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-green-800">계약서 서명이 완료되었습니다.</p>
                        <p className="text-sm text-green-600">
                          서명일: {activeContract.signed_at ? formatDate(activeContract.signed_at) : ''}
                          {activeContract.signed_ip && ` | IP: ${activeContract.signed_ip}`}
                        </p>
                      </div>
                    </div>
                    {activeContract.signature_data && (
                      <div className="mt-4 pt-4 border-t border-green-200">
                        <p className="text-xs text-green-600 mb-2">자필 서명</p>
                        <div className="inline-block border border-green-200 rounded-lg bg-white p-2">
                          <img
                            src={activeContract.signature_data}
                            alt="자필 서명"
                            className="max-w-[200px] h-auto"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 탈퇴 요청 상태 */}
                  {activeContract.withdrawal_status === 'pending' && (
                    <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-orange-600 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-orange-800">탈퇴 요청이 처리 중입니다</p>
                          <p className="text-xs text-orange-600 mt-0.5">
                            요청일: {activeContract.withdrawal_requested_at ? formatDate(activeContract.withdrawal_requested_at) : ''} | 관리자 승인 대기중
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeContract.withdrawal_status === 'rejected' && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-red-800">탈퇴 요청이 반려되었습니다</p>
                          {activeContract.withdrawal_rejected_reason && (
                            <p className="text-xs text-red-600 mt-1">
                              사유: {activeContract.withdrawal_rejected_reason}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowWithdrawalWizard(true)}
                            className="mt-2 text-xs text-red-700 underline hover:text-red-800"
                          >
                            다시 요청하기
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 탈퇴 요청 버튼 (pending이 아닐 때만) */}
                  {activeContract.withdrawal_status !== 'pending' && (
                    <div className="mt-4 text-center">
                      <button
                        type="button"
                        onClick={() => setShowWithdrawalWizard(true)}
                        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        계약 탈퇴 요청
                      </button>
                    </div>
                  )}

                  {/* 탈퇴 위자드 */}
                  <WithdrawalWizard
                    isOpen={showWithdrawalWizard}
                    onClose={() => setShowWithdrawalWizard(false)}
                    onSubmitted={() => fetchContracts()}
                    contract={activeContract}
                  />
                </>
              )}
            </Card>
          )}

          {/* 해지된 계약 안내 */}
          {terminatedContract && (
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-bold text-red-700">계약이 해지되었습니다</h2>
              </div>

              <div className="space-y-4">
                {/* 해지 정보 */}
                <div className="grid grid-cols-2 gap-3 p-4 bg-red-50 rounded-xl text-sm">
                  <div>
                    <span className="text-gray-500">해지일</span>
                    <p className="font-semibold text-gray-900">
                      {terminatedContract.terminated_at
                        ? formatDate(terminatedContract.terminated_at)
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">사유</span>
                    <p className="font-semibold text-gray-900">
                      {terminatedContract.termination_reason || '-'}
                    </p>
                  </div>
                </div>

                {/* 상품 철거 의무 (제11조) */}
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <h3 className="text-sm font-bold text-orange-800 mb-2">상품 철거 의무 (제11조)</h3>
                  <p className="text-sm text-orange-700">
                    프로그램을 통해 등록한 모든 상품을 아래 기한까지 쿠팡 Wing에서 비활성화(판매중지)해야 합니다.
                  </p>
                  {terminatedContract.product_deactivation_deadline && (
                    <div className="mt-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-bold text-orange-800">
                        철거 기한: {formatDate(terminatedContract.product_deactivation_deadline)}
                        {(() => {
                          const deadline = new Date(terminatedContract.product_deactivation_deadline!);
                          const now = new Date();
                          const diffMs = deadline.getTime() - now.getTime();
                          const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                          return ` (${daysLeft <= 0 ? `D+${Math.abs(daysLeft)} 초과` : `D-${daysLeft}`})`;
                        })()}
                      </span>
                    </div>
                  )}
                </div>

                {/* 위약금 안내 (제12조) */}
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h3 className="text-sm font-bold text-red-800 mb-1">위약금 안내 (제12조)</h3>
                  <p className="text-sm text-red-700">
                    기한 내 미이행 시 수수료율의 2배에 해당하는 위약금이 부과됩니다.
                  </p>
                </div>

                {/* 확인 섹션 */}
                {!terminatedContract.termination_acknowledged_at ? (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <label className="flex items-start gap-3 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={ackChecked}
                        onChange={(e) => setAckChecked(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837] mt-0.5"
                      />
                      <span className="text-sm text-gray-700">위 내용을 확인했습니다</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAcknowledge(terminatedContract.id)}
                      disabled={!ackChecked || ackLoading}
                      className="w-full py-2.5 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {ackLoading ? '처리 중...' : '확인 완료'}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">
                      확인 완료 ({formatDate(terminatedContract.termination_acknowledged_at)})
                    </span>
                  </div>
                )}

                {/* 상품 철거 증빙 */}
                {terminatedContract.termination_acknowledged_at && !terminatedContract.product_deactivation_confirmed && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-gray-600" />
                      <h3 className="text-sm font-bold text-gray-800">상품 철거 증빙</h3>
                    </div>
                    <p className="text-xs text-gray-600">
                      쿠팡 Wing에서 모든 상품을 판매중지한 화면을 캡처하여 업로드해주세요.
                    </p>

                    {terminatedContract.product_deactivation_evidence_url ? (
                      <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                        <CheckCircle className="w-4 h-4 text-blue-600" />
                        <span className="text-sm text-blue-700">증빙이 제출되었습니다. 관리자 확인 대기 중입니다.</span>
                      </div>
                    ) : (
                      <>
                        <FileUpload
                          label="철거 증빙 스크린샷"
                          onFileSelect={(file) => {
                            if (evidencePreviewUrl) URL.revokeObjectURL(evidencePreviewUrl);
                            setEvidenceFile(file);
                            setEvidencePreviewUrl(URL.createObjectURL(file));
                          }}
                          onClear={() => {
                            if (evidencePreviewUrl) URL.revokeObjectURL(evidencePreviewUrl);
                            setEvidenceFile(null);
                            setEvidencePreviewUrl(null);
                          }}
                          previewUrl={evidencePreviewUrl}
                        />
                        <button
                          type="button"
                          onClick={() => handleEvidenceUpload(terminatedContract.id)}
                          disabled={!evidenceFile || evidenceUploading}
                          className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          {evidenceUploading ? '업로드 중...' : '증빙 제출'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {terminatedContract.product_deactivation_confirmed && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">상품 철거가 확인되었습니다.</span>
                  </div>
                )}

                {terminationMessage && (
                  <div className={`px-4 py-3 rounded-lg text-sm ${
                    terminationMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {terminationMessage.text}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Past Contracts */}
          {contracts.filter((c) => c.status !== 'sent' && c.status !== 'signed' && c.status !== 'terminated').length > 0 && (
            <Card>
              <h2 className="text-lg font-bold text-gray-900 mb-4">과거 계약 이력</h2>
              <div className="space-y-3">
                {contracts
                  .filter((c) => c.status !== 'sent' && c.status !== 'signed' && c.status !== 'terminated')
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
