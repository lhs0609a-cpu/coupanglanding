'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import EmergencyResponseWizard from '@/components/my/EmergencyResponseWizard';
import type { Incident, BrandBlacklist } from '@/lib/supabase/types';
import {
  INCIDENT_TYPE_LABELS, INCIDENT_SUBTYPE_LABELS,
  INCIDENT_SEVERITY_LABELS, INCIDENT_SEVERITY_COLORS,
  INCIDENT_STATUS_LABELS, INCIDENT_STATUS_COLORS,
  BLACKLIST_RISK_LABELS, BLACKLIST_RISK_COLORS,
  COMPLAINT_TYPE_LABELS, COMPLAINT_TYPE_COLORS,
} from '@/lib/utils/constants';
import { ShieldAlert, AlertTriangle, Shield, Search, Plus } from 'lucide-react';

export default function MyEmergencyPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [blacklist, setBlacklist] = useState<BrandBlacklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardType, setWizardType] = useState<'brand_complaint' | 'account_penalty' | undefined>();
  const [searchTerm, setSearchTerm] = useState('');

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async () => {
    // 인시던트 로드
    const incidentRes = await fetch('/api/emergency/incidents');
    const incidentData = await incidentRes.json();
    if (incidentData.data) setIncidents(incidentData.data);

    // 블랙리스트 로드
    const blRes = await fetch(`/api/emergency/blacklist${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''}`);
    const blData = await blRes.json();
    if (blData.data) setBlacklist(blData.data);

    setLoading(false);
  }, [searchTerm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openWizard = (type: 'brand_complaint' | 'account_penalty') => {
    setWizardType(type);
    setWizardOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card><div className="py-8 text-center text-gray-400">불러오는 중...</div></Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">긴급 대응 센터</h1>
      </div>

      {/* 대응 시작 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => openWizard('brand_complaint')}
          className="text-left"
        >
          <Card className="hover:border-[#E31837] hover:shadow-md transition cursor-pointer h-full">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900">브랜드 클레임 대응</p>
                <p className="text-sm text-gray-500 mt-1">
                  상표권, 저작권, 정품인증, 병행수입, 가격정책
                </p>
                <div className="flex items-center gap-1 mt-2 text-xs text-[#E31837] font-medium">
                  <Plus className="w-3 h-3" />
                  대응 시작하기
                </div>
              </div>
            </div>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => openWizard('account_penalty')}
          className="text-left"
        >
          <Card className="hover:border-[#E31837] hover:shadow-md transition cursor-pointer h-full">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                <Shield className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900">계정 페널티 대응</p>
                <p className="text-sm text-gray-500 mt-1">
                  배송지연, CS미응답, 허위광고, 정보불일치, 계정정지
                </p>
                <div className="flex items-center gap-1 mt-2 text-xs text-[#E31837] font-medium">
                  <Plus className="w-3 h-3" />
                  대응 시작하기
                </div>
              </div>
            </div>
          </Card>
        </button>
      </div>

      {/* 내 인시던트 이력 */}
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-4">내 인시던트 이력</h2>
        {incidents.length === 0 ? (
          <div className="py-6 text-center text-gray-400 text-sm">
            아직 신고된 인시던트가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">날짜</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">유형</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">제목</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">심각도</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">상태</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc) => (
                  <tr key={inc.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{formatDate(inc.created_at)}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className="text-xs text-gray-500">{INCIDENT_TYPE_LABELS[inc.incident_type]}</span>
                      <br />
                      <span className="text-xs font-medium text-gray-700">{INCIDENT_SUBTYPE_LABELS[inc.sub_type] || inc.sub_type}</span>
                    </td>
                    <td className="py-2 px-3 text-gray-900 font-medium">{inc.title}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 브랜드 블랙리스트 */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            브랜드 블랙리스트
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="브랜드 검색..."
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent w-48"
            />
          </div>
        </div>

        {blacklist.length === 0 ? (
          <div className="py-6 text-center text-gray-400 text-sm">
            {searchTerm ? '검색 결과가 없습니다.' : '등록된 블랙리스트가 없습니다.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">브랜드</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">위험도</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">클레임 유형</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">신고 수</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">등록일</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 위자드 */}
      <EmergencyResponseWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSubmitted={loadData}
        initialType={wizardType}
      />
    </div>
  );
}
