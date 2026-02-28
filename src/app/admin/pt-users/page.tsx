'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, getCurrentYearMonth, formatYearMonth, formatPercent } from '@/lib/utils/format';
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PT_STATUS_LABELS,
  PT_STATUS_COLORS,
} from '@/lib/utils/constants';
import MonthPicker from '@/components/ui/MonthPicker';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import { Users, CheckCircle2, XCircle, ExternalLink, Eye, UserPlus, AlertTriangle } from 'lucide-react';
import type { PtUser, MonthlyReport, Profile } from '@/lib/supabase/types';

interface PtUserWithProfile extends PtUser {
  profile: Profile;
}

interface ReportWithScreenshot extends MonthlyReport {
  screenshot_url: string | null;
}

export default function AdminPtUsersPage() {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [ptUsers, setPtUsers] = useState<PtUserWithProfile[]>([]);
  const [reports, setReports] = useState<Map<string, ReportWithScreenshot>>(new Map());
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [screenshotModal, setScreenshotModal] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<{ reportId: string; note: string } | null>(null);

  // Add user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newSharePercentage, setNewSharePercentage] = useState(30);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data: usersData } = await supabase
      .from('pt_users')
      .select('*, profile:profiles(*)')
      .order('created_at', { ascending: false });

    const users = (usersData as PtUserWithProfile[]) || [];
    setPtUsers(users);

    if (users.length > 0) {
      const userIds = users.map((u) => u.id);
      const { data: reportsData } = await supabase
        .from('monthly_reports')
        .select('*')
        .eq('year_month', yearMonth)
        .in('pt_user_id', userIds);

      const reportMap = new Map<string, ReportWithScreenshot>();
      (reportsData || []).forEach((r) => {
        reportMap.set((r as ReportWithScreenshot).pt_user_id, r as ReportWithScreenshot);
      });
      setReports(reportMap);
    }

    setLoading(false);
  }, [yearMonth, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConfirm = async (report: ReportWithScreenshot, ptUserId: string) => {
    await Promise.all([
      supabase
        .from('monthly_reports')
        .update({
          payment_status: 'confirmed',
          payment_confirmed_at: new Date().toISOString(),
        })
        .eq('id', report.id),
      supabase
        .from('pt_users')
        .update({ program_access_active: true })
        .eq('id', ptUserId),
    ]);

    fetchData();
  };

  const handleReject = async (reportId: string) => {
    const note = prompt('거절 사유를 입력하세요:');
    if (note === null) return;

    await supabase
      .from('monthly_reports')
      .update({
        payment_status: 'rejected',
        admin_note: note || '거절됨',
      })
      .eq('id', reportId);

    fetchData();
  };

  const handleStatusChange = async (ptUserId: string, status: string) => {
    await supabase
      .from('pt_users')
      .update({ status })
      .eq('id', ptUserId);

    fetchData();
  };

  const handleToggleAccess = async (ptUserId: string, current: boolean) => {
    await supabase
      .from('pt_users')
      .update({ program_access_active: !current })
      .eq('id', ptUserId);

    fetchData();
  };

  const handleAddUser = async () => {
    // Note: 실제로는 Supabase Auth를 통해 사용자를 초대해야 함
    // 여기서는 이미 Auth에 등록된 사용자의 profile을 연결하는 방식
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', newEmail)
      .single();

    if (!profile) {
      alert('해당 이메일로 등록된 사용자가 없습니다. 먼저 Supabase Auth에서 사용자를 생성해주세요.');
      return;
    }

    await supabase.from('pt_users').insert({
      profile_id: profile.id,
      share_percentage: newSharePercentage,
      status: 'active',
      program_access_active: false,
    });

    // Update role to pt_user
    await supabase
      .from('profiles')
      .update({ role: 'pt_user', full_name: newName || undefined })
      .eq('id', profile.id);

    setAddModalOpen(false);
    setNewEmail('');
    setNewName('');
    setNewSharePercentage(30);
    fetchData();
  };

  const ptStatusOptions = Object.entries(PT_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">PT 사용자 관리</h1>
        </div>
        <div className="flex items-center gap-3">
          <MonthPicker value={yearMonth} onChange={setYearMonth} />
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition"
          >
            <UserPlus className="w-4 h-4" />
            사용자 추가
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">불러오는 중...</div>
      ) : ptUsers.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-gray-400">등록된 PT 사용자가 없습니다.</div>
        </Card>
      ) : (
        <div className="space-y-4">
          {ptUsers.map((user) => {
            const report = reports.get(user.id);
            const needsExternalActivation = report?.payment_status === 'confirmed' && !user.program_access_active;

            return (
              <Card key={user.id}>
                <div className="space-y-4">
                  {/* 사용자 정보 */}
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {user.profile?.full_name || '이름 없음'}
                      </h3>
                      <p className="text-sm text-gray-500">{user.profile?.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          label={PT_STATUS_LABELS[user.status]}
                          colorClass={PT_STATUS_COLORS[user.status]}
                        />
                        <span className="text-xs text-gray-400">
                          수수료율: {formatPercent(user.share_percentage)}
                        </span>
                        <Badge
                          label={user.program_access_active ? '프로그램 활성' : '프로그램 비활성'}
                          colorClass={user.program_access_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select
                        value={user.status}
                        onChange={(val) => handleStatusChange(user.id, val)}
                        options={ptStatusOptions}
                      />
                      <button
                        type="button"
                        onClick={() => handleToggleAccess(user.id, user.program_access_active)}
                        className={`px-3 py-2 text-xs font-medium rounded-lg transition ${
                          user.program_access_active
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {user.program_access_active ? '접근 중지' : '접근 허용'}
                      </button>
                    </div>
                  </div>

                  {/* 외부 프로그램 활성화 체크리스트 */}
                  {needsExternalActivation && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800">외부 프로그램 활성화 필요</p>
                        <p className="text-xs text-yellow-600 mt-0.5">
                          입금이 확인되었습니다. 외부 프로그램(coupang-sellerhub-new)에서 이 사용자를 수동으로 활성화해주세요.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 당월 보고 */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      {formatYearMonth(yearMonth)} 보고
                    </h4>

                    {report ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="space-y-1">
                            <p className="text-sm text-gray-600">
                              보고 매출: <span className="font-medium text-gray-900">{formatKRW(report.reported_revenue)}</span>
                            </p>
                            <p className="text-sm text-gray-600">
                              입금액: <span className="font-bold text-[#E31837]">{formatKRW(report.calculated_deposit)}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge
                              label={PAYMENT_STATUS_LABELS[report.payment_status]}
                              colorClass={PAYMENT_STATUS_COLORS[report.payment_status]}
                            />

                            {report.screenshot_url && (
                              <button
                                type="button"
                                onClick={() => setScreenshotModal(report.screenshot_url)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded transition"
                                title="스크린샷 보기"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 입금 확인/거절 버튼 */}
                        {report.payment_status === 'submitted' && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleConfirm(report, user.id)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              입금 확인
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(report.id)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition"
                            >
                              <XCircle className="w-4 h-4" />
                              거절
                            </button>
                          </div>
                        )}

                        {report.admin_note && (
                          <p className="text-xs text-gray-500 bg-white rounded p-2">
                            관리자 메모: {report.admin_note}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">아직 보고가 제출되지 않았습니다.</p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 사용자 추가 모달 */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="PT 사용자 추가"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Supabase Auth에 이미 등록된 사용자만 추가할 수 있습니다.
          </p>
          <Input
            id="newEmail"
            label="이메일"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="user@example.com"
          />
          <Input
            id="newName"
            label="이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="홍길동"
          />
          <NumberInput
            id="sharePercentage"
            label="수수료율"
            value={newSharePercentage}
            onChange={setNewSharePercentage}
            suffix="%"
          />

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleAddUser}
              disabled={!newEmail}
              className="flex-1 py-2.5 bg-[#E31837] text-white rounded-lg hover:bg-[#c01530] text-sm font-medium transition disabled:opacity-50"
            >
              추가
            </button>
          </div>
        </div>
      </Modal>

      {/* 스크린샷 미리보기 모달 */}
      <Modal
        isOpen={!!screenshotModal}
        onClose={() => setScreenshotModal(null)}
        title="매출 스크린샷"
        maxWidth="max-w-2xl"
      >
        {screenshotModal && (
          <div>
            <img
              src={screenshotModal}
              alt="매출 스크린샷"
              className="w-full rounded-lg"
            />
            <a
              href={screenshotModal}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 mt-3 text-sm text-[#E31837] hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              새 탭에서 열기
            </a>
          </div>
        )}
      </Modal>
    </div>
  );
}
