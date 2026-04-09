'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  RotateCcw, User, MapPin, Truck, Plus, Trash2, ChevronDown, Loader2,
  RefreshCw, Package, AlertCircle, CheckCircle2, ArrowDownCircle,
} from 'lucide-react';
import type { ShReturnRequest } from '@/lib/supabase/types';

interface AddressInfo {
  name: string;
  phone: string;
  address: string;
}

interface SavedSupplier {
  id: string;
  name: string;
  phone: string;
  address: string;
}

const STORAGE_KEY = 'megaload_saved_suppliers';

function loadSuppliers(): SavedSupplier[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveSuppliers(list: SavedSupplier[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

type CourierType = 'cj' | 'epost';
type DestType = 'warehouse' | 'supplier';

type StatusFilter = 'all' | 'RETURNS_UNCHECKED' | 'RELEASE_STOP_UNCHECKED' | 'VENDOR_WAREHOUSE_CONFIRM' | 'RETURNS_COMPLETED';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  RELEASE_STOP_UNCHECKED: { label: '출고중지', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  RETURNS_UNCHECKED: { label: '반품접수', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  VENDOR_WAREHOUSE_CONFIRM: { label: '입고완료', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  REQUEST_COUPANG_CHECK: { label: '쿠팡확인요청', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  RETURNS_COMPLETED: { label: '반품완료', color: 'bg-green-100 text-green-700 border-green-200' },
};

const DELIVERY_COMPANY_OPTIONS: { code: string; label: string }[] = [
  { code: 'CJGLS', label: 'CJ대한통운' },
  { code: 'EPOST', label: '우체국택배' },
  { code: 'HANJIN', label: '한진택배' },
  { code: 'KDEXP', label: '경동택배' },
];

export default function ReturnsPage() {
  const supabase = useMemo(() => createClient(), []);

  // --- 수거지 (구매자) ---
  const [sender, setSender] = useState<AddressInfo>({ name: '', phone: '', address: '' });

  // --- 도착지 ---
  const [destType, setDestType] = useState<DestType>('warehouse');
  const [warehouseAddr, setWarehouseAddr] = useState<AddressInfo>({ name: '', phone: '', address: '' });
  const [warehouseLoading, setWarehouseLoading] = useState(true);

  const [suppliers, setSuppliers] = useState<SavedSupplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('new');
  const [supplierForm, setSupplierForm] = useState<AddressInfo>({ name: '', phone: '', address: '' });

  // --- 택배사 ---
  const [courier, setCourier] = useState<CourierType>('cj');

  // --- 쿠팡 반품 요청 목록 ---
  const [returnRequests, setReturnRequests] = useState<ShReturnRequest[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('RETURNS_UNCHECKED');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [invoiceForms, setInvoiceForms] = useState<Record<number, { courier: string; invoice: string }>>({});
  const [invoiceSubmitting, setInvoiceSubmitting] = useState<number | null>(null);

  const formSectionRef = useRef<HTMLDivElement>(null);

  // 창고 주소 로드 (설정에서)
  const fetchWarehouseAddress = useCallback(async () => {
    setWarehouseLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) { setWarehouseLoading(false); return; }

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('return_address, business_name')
      .eq('profile_id', user.id)
      .single();

    if (shUser) {
      const d = shUser as Record<string, unknown>;
      const addr = d.return_address as Record<string, string> | null;
      setWarehouseAddr({
        name: (d.business_name as string) || '',
        phone: addr?.phone || '',
        address: addr?.address || '',
      });
    }
    setWarehouseLoading(false);
  }, [supabase]);

  useEffect(() => { fetchWarehouseAddress(); }, [fetchWarehouseAddress]);

  // localStorage 공급처 로드
  useEffect(() => {
    setSuppliers(loadSuppliers());
  }, []);

  // 공급처 선택 변경
  useEffect(() => {
    if (selectedSupplierId === 'new') {
      setSupplierForm({ name: '', phone: '', address: '' });
    } else {
      const found = suppliers.find(s => s.id === selectedSupplierId);
      if (found) setSupplierForm({ name: found.name, phone: found.phone, address: found.address });
    }
  }, [selectedSupplierId, suppliers]);

  // 반품 요청 목록 조회
  const fetchReturnRequests = useCallback(async (status: StatusFilter) => {
    setListLoading(true);
    setListError(null);
    try {
      const qs = status === 'all' ? '?status=all' : `?status=${status}`;
      const res = await fetch(`/api/megaload/returns/list${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '목록 조회 실패');
      setReturnRequests((json.items || []) as ShReturnRequest[]);
      setStatusCounts((json.statusCounts || {}) as Record<string, number>);
    } catch (e) {
      setListError(e instanceof Error ? e.message : '목록 조회 실패');
      setReturnRequests([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReturnRequests(statusFilter);
  }, [statusFilter, fetchReturnRequests]);

  // 동기화 버튼 → 쿠팡에서 최근 7일 반품 수집 후 목록 재조회
  const handleSync = async () => {
    setSyncing(true);
    setListError(null);
    try {
      const res = await fetch('/api/megaload/returns/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '동기화 실패');
      await fetchReturnRequests(statusFilter);
    } catch (e) {
      setListError(e instanceof Error ? e.message : '동기화 실패');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveSupplier = () => {
    if (!supplierForm.name.trim() || !supplierForm.address.trim()) return;
    const newSupplier: SavedSupplier = {
      id: Date.now().toString(),
      ...supplierForm,
    };
    const updated = [...suppliers, newSupplier];
    setSuppliers(updated);
    saveSuppliers(updated);
    setSelectedSupplierId(newSupplier.id);
  };

  const handleDeleteSupplier = (id: string) => {
    const updated = suppliers.filter(s => s.id !== id);
    setSuppliers(updated);
    saveSuppliers(updated);
    if (selectedSupplierId === id) setSelectedSupplierId('new');
  };

  // 카드 "이 건으로 접수" 클릭 → sender 자동 채우기 + scroll
  const handlePickRequest = (req: ShReturnRequest) => {
    setSender({
      name: req.requester_name || '',
      phone: req.requester_phone || '',
      address: req.requester_address || '',
    });
    setSelectedReceiptId(req.receipt_id);
    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // 카드 내부 인라인 운송장 등록
  const handleRegisterInvoice = async (receiptId: number) => {
    const form = invoiceForms[receiptId];
    if (!form?.courier || !form?.invoice?.trim()) {
      alert('택배사와 운송장 번호를 입력해주세요.');
      return;
    }
    setInvoiceSubmitting(receiptId);
    try {
      const res = await fetch('/api/megaload/returns/register-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId,
          deliveryCompanyCode: form.courier,
          invoiceNumber: form.invoice.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '등록 실패');
      await fetchReturnRequests(statusFilter);
      setExpandedCardId(null);
      alert('회수 운송장이 등록되었습니다.');
    } catch (e) {
      alert(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setInvoiceSubmitting(null);
    }
  };

  // 현재 도착지
  const destination: AddressInfo = destType === 'warehouse'
    ? warehouseAddr
    : supplierForm;

  // 접수 시작 — Document Picture-in-Picture로 항상 위에 떠 있는 플로팅 가이드 창을 연다.
  // 지원하지 않는 브라우저(Firefox/Safari 등)는 일반 팝업으로 폴백.
  const handleStartPickup = async () => {
    const urls: Record<CourierType, string> = {
      cj: 'https://www.cjlogistics.com/ko/tool/parcel/reservation-return',
      epost: 'https://parcel.epost.go.kr',
    };

    const guideData = {
      courier,
      sender,
      destination,
      courierUrl: urls[courier],
      receiptId: selectedReceiptId,
    };

    // 폴백용 sessionStorage (일반 팝업 경로에서 사용)
    sessionStorage.setItem('megaload_return_guide', JSON.stringify(guideData));

    // Document PiP iframe은 opener의 sessionStorage를 공유하지 않으므로
    // URL 파라미터로도 데이터를 전달한다.
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(guideData))));
    const guideUrl = `/return-guide?d=${encoded}`;

    const w = 420;
    const h = 660;

    // 1) Document Picture-in-Picture (항상 위에 뜨는 플로팅 창)
    const pipApi = (window as unknown as {
      documentPictureInPicture?: {
        requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window>;
      };
    }).documentPictureInPicture;

    if (pipApi) {
      try {
        const pipWindow = await pipApi.requestWindow({ width: w, height: h });
        pipWindow.document.title = '반품 수거 가이드';

        // PiP 창 내부 레이아웃 초기화
        const root = pipWindow.document.documentElement;
        const body = pipWindow.document.body;
        root.style.cssText = 'margin:0;padding:0;height:100%;';
        body.style.cssText = 'margin:0;padding:0;height:100vh;overflow:hidden;background:#f9fafb;';

        // iframe으로 /return-guide 로드 (자체 Tailwind CSS 포함)
        const iframe = pipWindow.document.createElement('iframe');
        iframe.src = guideUrl;
        iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
        iframe.allow = 'clipboard-read; clipboard-write';
        body.appendChild(iframe);

        return;
      } catch (e) {
        console.error('Document PiP 실패 — 일반 팝업으로 폴백', e);
      }
    }

    // 2) 폴백: 일반 팝업 (항상 위에 뜨지는 않지만 독립 창)
    const left = window.screenX + window.outerWidth - w - 20;
    const top = window.screenY + 60;
    const guideWin = window.open(
      '/return-guide',
      'returnGuide',
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (!guideWin || guideWin.closed || typeof guideWin.closed === 'undefined') {
      alert(
        '가이드 팝업이 차단되었습니다.\n\n' +
        '브라우저 주소창 오른쪽의 팝업 차단 아이콘을 클릭해서\n' +
        '"이 사이트의 팝업 허용"을 선택한 후 다시 시도해주세요.',
      );
      return;
    }

    guideWin.focus();
  };

  const destinationReady = destType === 'warehouse'
    ? destination.phone.trim() && destination.address.trim()
    : destination.name.trim() && destination.phone.trim() && destination.address.trim();
  const isReady = sender.name.trim() && sender.phone.trim() && sender.address.trim() && destinationReady;

  const filterTabs: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'RETURNS_UNCHECKED', label: '반품접수' },
    { value: 'RELEASE_STOP_UNCHECKED', label: '출고중지' },
    { value: 'VENDOR_WAREHOUSE_CONFIRM', label: '입고완료' },
    { value: 'RETURNS_COMPLETED', label: '완료' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <RotateCcw className="w-7 h-7 text-[#E31837]" />
            반품 수거 접수
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            쿠팡 반품 요청을 불러와서 바로 수거 접수하세요. 아래 카드를 클릭하면 구매자 정보가 자동으로 채워집니다.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-[#E31837] text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {syncing ? '동기화 중...' : '쿠팡에서 가져오기'}
        </button>
      </div>

      {/* ===== 쿠팡 반품 요청 목록 ===== */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-[#E31837]" />
            쿠팡 반품 요청
          </h2>
          <span className="text-xs text-gray-500">
            {listLoading ? '불러오는 중...' : `${returnRequests.length}건`}
          </span>
        </div>

        {/* 상태 탭 */}
        <div className="flex gap-2 flex-wrap">
          {filterTabs.map(tab => {
            const count = tab.value === 'all'
              ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
              : (statusCounts[tab.value] || 0);
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  active
                    ? 'bg-[#E31837] text-white border-[#E31837]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1.5 ${active ? 'text-white/80' : 'text-gray-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 안내 배너 */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>전담택배 반품 건은 쿠팡이 자동 수거하므로 목록에서 제외됩니다.</span>
        </div>

        {listError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{listError}</span>
          </div>
        )}

        {/* 카드 리스트 */}
        {listLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> 불러오는 중...
          </div>
        ) : returnRequests.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>조회된 반품 요청이 없습니다.</p>
            <p className="text-xs mt-1">&quot;쿠팡에서 가져오기&quot; 버튼을 눌러 동기화해주세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {returnRequests.map(req => {
              const status = STATUS_LABELS[req.receipt_status] || { label: req.receipt_status, color: 'bg-gray-100 text-gray-700 border-gray-200' };
              const isSelected = selectedReceiptId === req.receipt_id;
              const isExpanded = expandedCardId === req.receipt_id;
              const hasInvoice = !!req.return_delivery_invoice_no;
              const canRegister = req.receipt_status === 'RETURNS_UNCHECKED' && !hasInvoice;
              const form = invoiceForms[req.receipt_id] || { courier: 'CJGLS', invoice: '' };

              return (
                <div
                  key={req.id}
                  className={`border-2 rounded-xl p-4 transition ${
                    isSelected ? 'border-[#E31837] bg-red-50/40' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${status.color}`}>
                          {status.label}
                        </span>
                        <span className="text-xs text-gray-400">#{req.receipt_id}</span>
                        {req.return_delivery_type && (
                          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {req.return_delivery_type}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                        {req.product_name || '(상품명 없음)'}
                      </p>
                      {req.option_name && (
                        <p className="text-xs text-gray-500 line-clamp-1">{req.option_name}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {req.requester_name || '-'}
                        </span>
                        <span>{req.requester_phone || '-'}</span>
                      </div>
                      {req.requester_address && (
                        <p className="text-xs text-gray-500 line-clamp-1">
                          <MapPin className="w-3 h-3 inline mr-0.5" />
                          {req.requester_address}
                        </p>
                      )}
                      {req.reason_code_text && (
                        <p className="text-xs text-gray-500 italic">사유: {req.reason_code_text}</p>
                      )}
                      {hasInvoice && (
                        <div className="flex items-center gap-1.5 text-xs text-green-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          회수 운송장 등록됨: {req.return_delivery_company_code || ''} {req.return_delivery_invoice_no}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handlePickRequest(req)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#E31837] text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition"
                      >
                        <ArrowDownCircle className="w-3.5 h-3.5" />
                        이 건으로 접수
                      </button>
                      {canRegister && (
                        <button
                          onClick={() => setExpandedCardId(isExpanded ? null : req.receipt_id)}
                          className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition"
                        >
                          {isExpanded ? '접기' : '운송장 등록'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 운송장 등록 인라인 폼 */}
                  {isExpanded && canRegister && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                      <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
                        <div className="relative">
                          <select
                            value={form.courier}
                            onChange={e => setInvoiceForms(prev => ({
                              ...prev,
                              [req.receipt_id]: { ...form, courier: e.target.value },
                            }))}
                            className="w-full px-2 py-2 pr-7 border border-gray-300 rounded-lg text-xs appearance-none bg-white"
                          >
                            {DELIVERY_COMPANY_OPTIONS.map(opt => (
                              <option key={opt.code} value={opt.code}>{opt.label}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>
                        <input
                          type="text"
                          value={form.invoice}
                          onChange={e => setInvoiceForms(prev => ({
                            ...prev,
                            [req.receipt_id]: { ...form, invoice: e.target.value },
                          }))}
                          placeholder="운송장 번호"
                          className="px-2 py-2 border border-gray-300 rounded-lg text-xs"
                        />
                        <button
                          onClick={() => handleRegisterInvoice(req.receipt_id)}
                          disabled={invoiceSubmitting === req.receipt_id}
                          className="px-3 py-2 bg-[#E31837] text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-1"
                        >
                          {invoiceSubmitting === req.receipt_id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          등록
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div ref={formSectionRef} className="grid lg:grid-cols-2 gap-6">
        {/* ===== 수거지 (구매자) ===== */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-500" />
            수거지 (구매자)
            {selectedReceiptId && (
              <span className="text-[10px] bg-red-100 text-[#E31837] px-2 py-0.5 rounded-full font-semibold">
                #{selectedReceiptId} 선택됨
              </span>
            )}
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
              <input
                type="text"
                value={sender.name}
                onChange={e => setSender(p => ({ ...p, name: e.target.value }))}
                placeholder="구매자 이름"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
              <input
                type="text"
                value={sender.phone}
                onChange={e => setSender(p => ({ ...p, phone: e.target.value }))}
                placeholder="010-0000-0000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
              <textarea
                value={sender.address}
                onChange={e => setSender(p => ({ ...p, address: e.target.value }))}
                placeholder="쿠팡 주문에서 구매자 주소를 복사해 붙여넣으세요"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent resize-none"
              />
            </div>
          </div>
        </section>

        {/* ===== 도착지 ===== */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-500" />
            도착지
          </h2>

          {/* 라디오 선택 */}
          <div className="flex gap-3">
            {[
              { value: 'warehouse' as DestType, label: '우리 창고' },
              { value: 'supplier' as DestType, label: '공급처로 직접' },
            ].map(opt => (
              <label
                key={opt.value}
                className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition text-sm font-medium ${
                  destType === opt.value
                    ? 'border-[#E31837] bg-red-50 text-[#E31837]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="destType"
                  value={opt.value}
                  checked={destType === opt.value}
                  onChange={() => setDestType(opt.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>

          {/* 우리 창고 */}
          {destType === 'warehouse' && (
            <div className="space-y-2">
              {warehouseLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> 설정에서 반품 주소 불러오는 중...
                </div>
              ) : warehouseAddr.address ? (
                <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
                  {warehouseAddr.name && (
                    <p className="font-medium text-gray-900">{warehouseAddr.name}</p>
                  )}
                  <p className="text-gray-600">{warehouseAddr.phone}</p>
                  <p className="text-gray-600">{warehouseAddr.address}</p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                  반품 주소가 설정되지 않았습니다.{' '}
                  <a href="/megaload/settings" className="underline font-medium">설정 페이지</a>에서 먼저 등록해 주세요.
                </div>
              )}
            </div>
          )}

          {/* 공급처로 직접 */}
          {destType === 'supplier' && (
            <div className="space-y-3">
              {/* 저장된 공급처 선택 */}
              <div className="relative">
                <select
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                >
                  <option value="new">+ 새 공급처 입력</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} — {s.address.slice(0, 20)}...</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>

              {/* 입력 폼 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">공급처명</label>
                <input
                  type="text"
                  value={supplierForm.name}
                  onChange={e => setSupplierForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="공급처(업체) 이름"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
                <input
                  type="text"
                  value={supplierForm.phone}
                  onChange={e => setSupplierForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="010-0000-0000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                <textarea
                  value={supplierForm.address}
                  onChange={e => setSupplierForm(p => ({ ...p, address: e.target.value }))}
                  placeholder="공급처 주소"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent resize-none"
                />
              </div>

              {/* 저장 / 삭제 버튼 */}
              <div className="flex gap-2">
                {selectedSupplierId === 'new' ? (
                  <button
                    onClick={handleSaveSupplier}
                    disabled={!supplierForm.name.trim() || !supplierForm.address.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#E31837] border border-[#E31837] rounded-lg hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    공급처 저장
                  </button>
                ) : (
                  <button
                    onClick={() => handleDeleteSupplier(selectedSupplierId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-500 border border-red-300 rounded-lg hover:bg-red-50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    삭제
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ===== 택배사 선택 + 접수 시작 ===== */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Truck className="w-5 h-5 text-purple-500" />
          택배사 선택
        </h2>

        <div className="grid grid-cols-2 gap-4">
          {([
            { value: 'cj' as CourierType, label: 'CJ대한통운', desc: '반품 예약 접수' },
            { value: 'epost' as CourierType, label: '우체국택배', desc: '방문접수 신청' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCourier(opt.value)}
              className={`flex flex-col items-center justify-center gap-1 py-6 rounded-xl border-2 transition text-center ${
                courier === opt.value
                  ? 'border-[#E31837] bg-red-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Truck className={`w-8 h-8 ${courier === opt.value ? 'text-[#E31837]' : 'text-gray-400'}`} />
              <span className={`text-base font-bold ${courier === opt.value ? 'text-[#E31837]' : 'text-gray-700'}`}>
                {opt.label}
              </span>
              <span className="text-xs text-gray-500">{opt.desc}</span>
            </button>
          ))}
        </div>

        <button
          onClick={handleStartPickup}
          disabled={!isReady}
          className="w-full py-3.5 rounded-xl text-white font-bold text-base bg-[#E31837] hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-5 h-5" />
          접수 시작 — 플로팅 가이드 열기
        </button>

        {!isReady && (
          <p className="text-xs text-gray-400 text-center">
            수거지와 도착지 정보를 모두 입력하면 접수를 시작할 수 있습니다.
          </p>
        )}
      </section>

    </div>
  );
}
