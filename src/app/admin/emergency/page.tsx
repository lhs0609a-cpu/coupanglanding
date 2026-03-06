'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import IncidentReviewModal from '@/components/admin/IncidentReviewModal';
import BlacklistManageModal from '@/components/admin/BlacklistManageModal';
import type { Incident, BrandBlacklist } from '@/lib/supabase/types';
import {
  INCIDENT_TYPE_LABELS, INCIDENT_SUBTYPE_LABELS,
  INCIDENT_SEVERITY_LABELS, INCIDENT_SEVERITY_COLORS,
  INCIDENT_STATUS_LABELS, INCIDENT_STATUS_COLORS,
  BLACKLIST_RISK_LABELS, BLACKLIST_RISK_COLORS,
  COMPLAINT_TYPE_LABELS, COMPLAINT_TYPE_COLORS,
} from '@/lib/utils/constants';
import { ShieldAlert, Plus, Search, Trash2 } from 'lucide-react';

type Tab = 'incidents' | 'blacklist';

interface IncidentWithUser extends Incident {
  pt_user?: {
    id: string;
    profile?: {
      id: string;
      full_name: string;
      email: string;
    };
  };
}

export default function AdminEmergencyPage() {
  const [tab, setTab] = useState<Tab>('incidents');
  const [incidents, setIncidents] = useState<IncidentWithUser[]>([]);
  const [blacklist, setBlacklist] = useState<BrandBlacklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [selectedIncident, setSelectedIncident] = useState<IncidentWithUser | null>(null);
  const [blacklistModalOpen, setBlacklistModalOpen] = useState(false);
  const [selectedBlacklist, setSelectedBlacklist] = useState<BrandBlacklist | null>(null);

  const loadIncidents = useCallback(async () => {
    const res = await fetch(`/api/admin/incidents?status=${statusFilter}`);
    const data = await res.json();
    if (data.data) setIncidents(data.data);
  }, [statusFilter]);

  const loadBlacklist = useCallback(async () => {
    const res = await fetch(`/api/emergency/blacklist${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''}`);
    const data = await res.json();
    if (data.data) setBlacklist(data.data);
  }, [searchTerm]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadIncidents(), loadBlacklist()]).then(() => setLoading(false));
  }, [loadIncidents, loadBlacklist]);

  const handleDeleteBlacklist = async (id: string, brandName: string) => {
    if (!confirm(`"${brandName}" 브랜드를 블랙리스트에서 삭제하시겠습니까?`)) return;

    const res = await fetch(`/api/emergency/blacklist?id=${id}`, { method: 'DELETE' });
    if (res.ok) loadBlacklist();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card><div className="py-8 text-center text-gray-400">불러오는 중...</div></Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">긴급 대응 관리</h1>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '전체', value: incidents.length, color: 'text-gray-900' },
          { label: '신고됨', value: incidents.filter(i => i.status === 'reported').length, color: 'text-blue-600' },
          { label: '처리중', value: incidents.filter(i => i.status === 'in_progress').length, color: 'text-yellow-600' },
          { label: '에스컬레이션', value: incidents.filter(i => i.status === 'escalated').length, color: 'text-red-600' },
        ].map(stat => (
          <Card key={stat.label}>
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['incidents', 'blacklist'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              tab === t
                ? 'border-[#E31837] text-[#E31837]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'incidents' ? '인시던트 관리' : '블랙리스트 관리'}
          </button>
        ))}
      </div>

      {/* 인시던트 탭 */}
      {tab === 'incidents' && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <label className="text-sm font-medium text-gray-700">상태:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            >
              <option value="all">전체</option>
              <option value="reported">신고됨</option>
              <option value="in_progress">처리 중</option>
              <option value="escalated">에스컬레이션</option>
              <option value="resolved">해결됨</option>
              <option value="closed">종료</option>
            </select>
          </div>

          {incidents.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">인시던트가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">날짜</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">파트너</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">유형</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">제목</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">심각도</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">상태</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((inc) => {
                    const name = inc.pt_user?.profile?.full_name || inc.pt_user?.profile?.email || '-';
                    return (
                      <tr key={inc.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{formatDate(inc.created_at)}</td>
                        <td className="py-2 px-3 font-medium text-gray-900">{name}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="text-xs text-gray-500">{INCIDENT_TYPE_LABELS[inc.incident_type]}</span>
                          <br />
                          <span className="text-xs font-medium">{INCIDENT_SUBTYPE_LABELS[inc.sub_type] || inc.sub_type}</span>
                        </td>
                        <td className="py-2 px-3 text-gray-900">{inc.title}</td>
                        <td className="py-2 px-3">
                          <Badge className={INCIDENT_SEVERITY_COLORS[inc.severity]}>
                            {INCIDENT_SEVERITY_LABELS[inc.severity]}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          <Badge className={INCIDENT_STATUS_COLORS[inc.status]}>
                            {INCIDENT_STATUS_LABELS[inc.status]}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            onClick={() => setSelectedIncident(inc)}
                            className="text-xs text-[#E31837] hover:underline font-medium"
                          >
                            리뷰
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* 블랙리스트 탭 */}
      {tab === 'blacklist' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="브랜드 검색..."
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837] w-56"
              />
            </div>
            <button
              type="button"
              onClick={() => { setSelectedBlacklist(null); setBlacklistModalOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition"
            >
              <Plus className="w-4 h-4" />
              추가
            </button>
          </div>

          {blacklist.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              {searchTerm ? '검색 결과가 없습니다.' : '등록된 블랙리스트가 없습니다.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">브랜드</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">카테고리</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">위험도</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">클레임 유형</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">신고 수</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">등록일</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {blacklist.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <span className="font-medium text-gray-900">{item.brand_name}</span>
                        {item.brand_name_en && (
                          <span className="text-xs text-gray-400 ml-1">({item.brand_name_en})</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-gray-500">{item.category || '-'}</td>
                      <td className="py-2 px-3">
                        <Badge className={BLACKLIST_RISK_COLORS[item.risk_level]}>
                          {BLACKLIST_RISK_LABELS[item.risk_level]}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        <Badge className={COMPLAINT_TYPE_COLORS[item.complaint_type]}>
                          {COMPLAINT_TYPE_LABELS[item.complaint_type]}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-gray-700">{item.reported_count}건</td>
                      <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{formatDate(item.created_at)}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setSelectedBlacklist(item); setBlacklistModalOpen(true); }}
                            className="text-xs text-[#E31837] hover:underline font-medium"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBlacklist(item.id, item.brand_name)}
                            className="text-gray-400 hover:text-red-600 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Modals */}
      {selectedIncident && (
        <IncidentReviewModal
          isOpen={!!selectedIncident}
          onClose={() => setSelectedIncident(null)}
          incident={selectedIncident}
          onReviewed={() => { setSelectedIncident(null); loadIncidents(); }}
        />
      )}

      <BlacklistManageModal
        isOpen={blacklistModalOpen}
        onClose={() => { setBlacklistModalOpen(false); setSelectedBlacklist(null); }}
        item={selectedBlacklist}
        onSaved={() => { setBlacklistModalOpen(false); setSelectedBlacklist(null); loadBlacklist(); }}
      />
    </div>
  );
}
