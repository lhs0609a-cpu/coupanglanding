'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatPercent } from '@/lib/utils/format';
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  CONTRACT_MODE_LABELS,
  CONTRACT_MODE_COLORS,
} from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { renderArticleText, getContractArticles } from '@/lib/data/contract-terms';
import { FileText, Plus, RefreshCw, Send, XCircle, Eye, Download, CheckCircle2, AlertTriangle, Image, Copy, Link2 } from 'lucide-react';
import { downloadContractPdf } from '@/lib/utils/contract-pdf';
import ContractTerminationModal from '@/components/admin/ContractTerminationModal';
import WithdrawalReviewModal from '@/components/admin/WithdrawalReviewModal';
import type { Contract, PtUser, Profile } from '@/lib/supabase/types';

interface ContractWithUser extends Contract {
  pt_user: PtUser & { profile: Profile };
}

interface PtUserWithProfile extends PtUser {
  profile: Profile;
}

const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'draft', label: '초안' },
  { value: 'sent', label: '발송됨' },
  { value: 'signed', label: '서명완료' },
  { value: 'withdrawal_pending', label: '탈퇴요청' },
  { value: 'expired', label: '만료' },
  { value: 'terminated', label: '해지' },
];

export default function AdminContractsPage() {
  const [contracts, setContracts] = useState<ContractWithUser[]>([]);
  const [ptUsers, setPtUsers] = useState<PtUserWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [createModal, setCreateModal] = useState(false);
  const [viewContract, setViewContract] = useState<ContractWithUser | null>(null);

  // Termination modal
  const [terminateTarget, setTerminateTarget] = useState<ContractWithUser | null>(null);
  // Withdrawal review modal
  const [withdrawalReviewTarget, setWithdrawalReviewTarget] = useState<ContractWithUser | null>(null);

  // Create form
  const [newPtUserId, setNewPtUserId] = useState('');
  const [newSharePercentage, setNewSharePercentage] = useState('30');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newContractMode, setNewContractMode] = useState<'single' | 'triple'>('single');
  const [creating, setCreating] = useState(false);
  const [linkCopied, setLinkCopied] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchPtUsers = useCallback(async () => {
    // 1차: profile join 포함
    const { data, error } = await supabase
      .from('pt_users')
      .select('*, profile:profiles(*)');

    let users: PtUserWithProfile[] = [];

    if (!error && data && data.length > 0) {
      users = data as PtUserWithProfile[];
    } else if (error) {
      // join 실패 시 pt_users만 조회 후 profiles 별도 조회
      console.warn('pt_users join failed, trying fallback:', error.message);
      const { data: rawUsers } = await supabase
        .from('pt_users')
        .select('*');

      if (rawUsers && rawUsers.length > 0) {
        const profileIds = rawUsers.map((u) => (u as PtUser).profile_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', profileIds);

        const profileMap = new Map((profiles || []).map((p) => [(p as Profile).id, p as Profile]));
        users = rawUsers.map((u) => ({
          ...(u as PtUser),
          profile: profileMap.get((u as PtUser).profile_id) || null,
        })) as PtUserWithProfile[];
      }
    }

    // 승인된 profiles 중 pt_users 레코드가 없는 사용자 자동 생성
    const { data: approvedProfiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'pt_user')
      .eq('is_active', true);

    if (approvedProfiles && approvedProfiles.length > 0) {
      const existingProfileIds = new Set(users.map((u) => u.profile_id));
      const missing = (approvedProfiles as Profile[]).filter((p) => !existingProfileIds.has(p.id));

      for (const profile of missing) {
        const { data: newPtUser } = await supabase
          .from('pt_users')
          .insert({
            profile_id: profile.id,
            share_percentage: 30,
            status: 'active',
            program_access_active: false,
          })
          .select('*')
          .single();

        if (newPtUser) {
          users.push({ ...(newPtUser as PtUser), profile } as PtUserWithProfile);
        }
      }
    }

    setPtUsers(users);
  }, [supabase]);

  const fetchData = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('contracts')
      .select('*, pt_user:pt_users(*, profile:profiles(*))')
      .order('created_at', { ascending: false });

    if (statusFilter === 'withdrawal_pending') {
      query = query.eq('withdrawal_status', 'pending');
    } else if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: contractsData } = await query;
    setContracts((contractsData as ContractWithUser[]) || []);

    await fetchPtUsers();
    setLoading(false);
  }, [statusFilter, supabase, fetchPtUsers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async () => {
    if (!newPtUserId || !newStartDate) return;
    setCreating(true);

    const { data, error } = await supabase
      .from('contracts')
      .insert({
        pt_user_id: newPtUserId,
        share_percentage: parseFloat(newSharePercentage),
        start_date: newStartDate,
        end_date: newEndDate || null,
        status: 'draft',
        contract_type: 'standard',
        contract_mode: newContractMode,
        terms: {},
      })
      .select('*, pt_user:pt_users(*, profile:profiles(*))')
      .single();

    if (error) {
      alert(`계약 생성 실패: ${error.message}`);
      setCreating(false);
      return;
    }

    if (data) {
      setContracts((prev) => [data as ContractWithUser, ...prev]);
    }

    setCreateModal(false);
    setNewPtUserId('');
    setNewSharePercentage('30');
    setNewStartDate('');
    setNewEndDate('');
    setNewContractMode('single');
    setCreating(false);
  };

  const handleSend = async (id: string) => {
    if (!confirm('이 계약서를 사용자에게 발송하시겠습니까?')) return;
    const { error } = await supabase.from('contracts').update({ status: 'sent' }).eq('id', id);
    if (error) {
      alert(`발송 실패: ${error.message}`);
      return;
    }
    setContracts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'sent' as const } : c))
    );
  };

  const handleTerminate = (contract: ContractWithUser) => {
    setTerminateTarget(contract);
  };

  const handleTerminated = () => {
    fetchData();
  };

  const handleConfirmDeactivation = async (contractId: string) => {
    const { error } = await supabase
      .from('contracts')
      .update({ product_deactivation_confirmed: true })
      .eq('id', contractId);

    if (error) {
      alert(`철거 확인 실패: ${error.message}`);
      return;
    }
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">계약 관리</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
          <button
            type="button"
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition"
          >
            <Plus className="w-4 h-4" />
            새 계약
          </button>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition ${
              statusFilter === f.value
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="text-center py-12 text-gray-400">불러오는 중...</div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">계약이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">PT 사용자</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">수수료율</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 hidden sm:table-cell">시작일</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 hidden lg:table-cell">모드</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">상태</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 hidden md:table-cell">서명일</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">관리</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="py-3 px-4 font-medium text-gray-900">
                      {contract.pt_user?.profile?.full_name || contract.pt_user?.profile?.email || '-'}
                    </td>
                    <td className="py-3 px-4 text-[#E31837] font-semibold">
                      {formatPercent(contract.share_percentage)}
                    </td>
                    <td className="py-3 px-4 text-gray-600 hidden sm:table-cell">{contract.start_date}</td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <Badge
                        label={CONTRACT_MODE_LABELS[contract.contract_mode || 'single']}
                        colorClass={CONTRACT_MODE_COLORS[contract.contract_mode || 'single']}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge label={CONTRACT_STATUS_LABELS[contract.status]} colorClass={CONTRACT_STATUS_COLORS[contract.status]} />
                        {contract.contract_mode === 'triple' && contract.signed_at && !contract.business_signed_at && (
                          <Badge label="을 서명대기" colorClass="bg-purple-100 text-purple-700" />
                        )}
                        {contract.withdrawal_status === 'pending' && (
                          <Badge label="탈퇴요청" colorClass="bg-orange-100 text-orange-700" />
                        )}
                        {contract.status === 'terminated' && contract.product_deactivation_deadline && !contract.product_deactivation_confirmed && (() => {
                          const deadline = new Date(contract.product_deactivation_deadline);
                          const now = new Date();
                          const diffMs = deadline.getTime() - now.getTime();
                          const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                          return (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              daysLeft <= 0 ? 'bg-red-100 text-red-700' : daysLeft <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {daysLeft <= 0 ? `D+${Math.abs(daysLeft)}` : `D-${daysLeft}`}
                            </span>
                          );
                        })()}
                        {contract.status === 'terminated' && contract.product_deactivation_confirmed && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                            철거완료
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-500 hidden md:table-cell">
                      {contract.signed_at ? formatDate(contract.signed_at) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setViewContract(contract)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                          title="상세보기"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          보기
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadContractPdf({ contract, ptUser: contract.pt_user })}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition"
                          title="PDF 다운로드"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </button>
                        {contract.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => handleSend(contract.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
                            title="발송"
                          >
                            <Send className="w-3.5 h-3.5" />
                            발송
                          </button>
                        )}
                        {(contract.status === 'sent' || contract.status === 'signed') && !contract.withdrawal_status && (
                          <button
                            type="button"
                            onClick={() => handleTerminate(contract)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition"
                            title="해지"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            해지
                          </button>
                        )}
                        {contract.contract_mode === 'triple' && contract.business_sign_token && !contract.business_signed_at && (
                          <button
                            type="button"
                            onClick={() => {
                              const url = `${window.location.origin}/sign/business/${contract.business_sign_token}`;
                              navigator.clipboard.writeText(url);
                              setLinkCopied(contract.id);
                              setTimeout(() => setLinkCopied(null), 2000);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition"
                            title="사업자 서명 링크 복사"
                          >
                            {linkCopied === contract.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                            {linkCopied === contract.id ? '복사됨' : '서명링크'}
                          </button>
                        )}
                        {contract.withdrawal_status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => setWithdrawalReviewTarget(contract)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100 transition"
                            title="탈퇴심사"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            탈퇴심사
                          </button>
                        )}
                        {contract.status === 'terminated' && (
                          <div className="flex items-center gap-1">
                            {contract.product_deactivation_confirmed ? (
                              <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-lg">
                                <CheckCircle2 className="w-3 h-3" />
                                철거완료
                              </span>
                            ) : (
                              <>
                                {contract.product_deactivation_evidence_url && (
                                  <button
                                    type="button"
                                    onClick={() => window.open(contract.product_deactivation_evidence_url!, '_blank')}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
                                    title="증빙 확인"
                                  >
                                    <Image className="w-3 h-3" />
                                    증빙
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleConfirmDeactivation(contract.id)}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition"
                                  title="철거 확인"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  철거확인
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Contract Detail Modal */}
      <Modal
        isOpen={!!viewContract}
        onClose={() => setViewContract(null)}
        title="계약서 상세보기"
        maxWidth="max-w-2xl"
      >
        {viewContract && (
          <div className="space-y-4">
            {/* 계약 정보 요약 */}
            <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl text-sm">
              <div>
                <span className="text-gray-500">사용자:</span>{' '}
                <span className="font-medium text-gray-900">
                  {viewContract.pt_user?.profile?.full_name || '-'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">수수료율:</span>{' '}
                <span className="font-bold text-[#E31837]">{formatPercent(viewContract.share_percentage)}</span>
              </div>
              <div>
                <span className="text-gray-500">기간:</span>{' '}
                <span className="font-medium">{viewContract.start_date} ~ {viewContract.end_date || '무기한'}</span>
              </div>
              <div>
                <span className="text-gray-500">상태:</span>{' '}
                <Badge label={CONTRACT_STATUS_LABELS[viewContract.status]} colorClass={CONTRACT_STATUS_COLORS[viewContract.status]} />
              </div>
              <div>
                <span className="text-gray-500">모드:</span>{' '}
                <Badge label={CONTRACT_MODE_LABELS[viewContract.contract_mode || 'single']} colorClass={CONTRACT_MODE_COLORS[viewContract.contract_mode || 'single']} />
              </div>
              {viewContract.signed_at && (
                <div>
                  <span className="text-gray-500">{viewContract.contract_mode === 'triple' ? '운영자 서명일' : '서명일'}:</span>{' '}
                  <span className="font-medium">{formatDate(viewContract.signed_at)}</span>
                </div>
              )}
              {viewContract.signed_ip && (
                <div>
                  <span className="text-gray-500">{viewContract.contract_mode === 'triple' ? '운영자 서명 IP' : '서명 IP'}:</span>{' '}
                  <span className="font-mono text-gray-700">{viewContract.signed_ip}</span>
                </div>
              )}
              {viewContract.contract_mode === 'triple' && viewContract.business_signed_at && (
                <>
                  <div>
                    <span className="text-gray-500">사업자 서명일:</span>{' '}
                    <span className="font-medium">{formatDate(viewContract.business_signed_at)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">사업자 서명자:</span>{' '}
                    <span className="font-medium">{viewContract.business_signer_name || '-'}</span>
                  </div>
                </>
              )}
            </div>

            {/* 계약서 전문 */}
            {(() => {
              const contractMode = (viewContract.contract_mode || 'single') as 'single' | 'triple';
              const articles = getContractArticles(contractMode);
              const title = contractMode === 'triple'
                ? '쿠팡 셀러허브 PT 코칭 3자 계약서'
                : '쿠팡 셀러허브 PT 코칭 계약서';
              return (
                <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-xl p-5 space-y-4">
                  <div className="text-center border-b border-gray-200 pb-4">
                    <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                    <p className="text-xs text-gray-500 mt-1">전자계약서 (총 {articles.length}조)</p>
                  </div>
                  <div className="space-y-4 text-sm leading-relaxed text-gray-700">
                    {articles.map((article) => {
                      const vars = {
                        share_percentage: viewContract.share_percentage,
                        start_date: viewContract.start_date,
                        end_date: viewContract.end_date,
                      };
                      return (
                        <div key={article.number}>
                          <h4 className="font-bold text-gray-900 mb-1.5">
                            제{article.number}조 ({article.title})
                          </h4>
                          {article.paragraphs.map((p, i) => (
                            <p key={i} className={i > 0 ? 'mt-1' : ''}>
                              {renderArticleText(p, vars)}
                            </p>
                          ))}
                          {article.subItems && (
                            <ul className="list-disc pl-5 mt-1.5 space-y-0.5">
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
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* Termination Modal */}
      {terminateTarget && (
        <ContractTerminationModal
          isOpen={!!terminateTarget}
          onClose={() => setTerminateTarget(null)}
          contractId={terminateTarget.id}
          userName={terminateTarget.pt_user?.profile?.full_name || '사용자'}
          onTerminated={handleTerminated}
        />
      )}

      {/* Withdrawal Review Modal */}
      {withdrawalReviewTarget && (
        <WithdrawalReviewModal
          isOpen={!!withdrawalReviewTarget}
          onClose={() => setWithdrawalReviewTarget(null)}
          contract={withdrawalReviewTarget}
          onReviewed={() => { setWithdrawalReviewTarget(null); fetchData(); }}
        />
      )}

      {/* Create Contract Modal */}
      <Modal isOpen={createModal} onClose={() => setCreateModal(false)} title="새 계약 생성" maxWidth="max-w-lg">
        <div className="space-y-4">
          <div>
            <label htmlFor="pt-user" className="block text-sm font-medium text-gray-700 mb-1">
              PT 사용자 <span className="text-[#E31837]">*</span>
            </label>
            {ptUsers.length === 0 ? (
              <div className="space-y-2">
                <div className="px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                  등록된 PT 사용자가 없습니다. 먼저 대시보드에서 사용자를 승인하거나 PT 사용자 관리에서 추가해주세요.
                </div>
                <button
                  type="button"
                  onClick={fetchPtUsers}
                  className="text-sm text-[#E31837] hover:underline"
                >
                  다시 불러오기
                </button>
              </div>
            ) : (
              <select
                id="pt-user"
                value={newPtUserId}
                onChange={(e) => {
                  setNewPtUserId(e.target.value);
                  const selected = ptUsers.find((u) => u.id === e.target.value);
                  if (selected) {
                    setNewSharePercentage(String(selected.share_percentage));
                    // 타인 명의 사업자인 경우 자동으로 3자 계약 선택
                    const selfBiz = (selected as Record<string, unknown>).is_self_business;
                    setNewContractMode(selfBiz === false ? 'triple' : 'single');
                  }
                }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              >
                <option value="">선택하세요</option>
                {ptUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.profile?.full_name || u.profile?.email || '이름 없음'} ({u.status === 'active' ? '활성' : u.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="share" className="block text-sm font-medium text-gray-700 mb-1">
              수수료율 (%)
            </label>
            <input
              id="share"
              type="number"
              min="0"
              max="100"
              value={newSharePercentage}
              onChange={(e) => setNewSharePercentage(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">
              시작일 <span className="text-[#E31837]">*</span>
            </label>
            <input
              id="start-date"
              type="date"
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">
              종료일 <span className="text-gray-400 font-normal">(비워두면 무기한)</span>
            </label>
            <input
              id="end-date"
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="contract-mode" className="block text-sm font-medium text-gray-700 mb-1">
              계약 모드
            </label>
            <select
              id="contract-mode"
              value={newContractMode}
              onChange={(e) => setNewContractMode(e.target.value as 'single' | 'triple')}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            >
              <option value="single">2자 계약 (갑-을)</option>
              <option value="triple">3자 계약 (갑-을-병)</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {newContractMode === 'triple'
                ? '사업자 명의인과 실운영자가 다른 경우 (연대책임)'
                : '본인 명의 사업자인 경우'}
            </p>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setCreateModal(false)}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !newPtUserId || !newStartDate}
              className="px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50"
            >
              {creating ? '생성 중...' : '계약 생성'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
