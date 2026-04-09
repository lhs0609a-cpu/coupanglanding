'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  RotateCcw, User, MapPin, Truck, Plus, Trash2, ChevronDown, Loader2,
} from 'lucide-react';

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

  // 현재 도착지
  const destination: AddressInfo = destType === 'warehouse'
    ? warehouseAddr
    : supplierForm;

  // 접수 시작 — 가이드를 팝업 윈도우로 띄워서 택배사 사이트 옆에 나란히 사용 가능
  const handleStartPickup = () => {
    const urls: Record<CourierType, string> = {
      cj: 'https://www.cjlogistics.com/ko/tool/parcel/reservation-return',
      epost: 'https://parcel.epost.go.kr',
    };

    // sessionStorage로 가이드 데이터 전달
    sessionStorage.setItem('megaload_return_guide', JSON.stringify({
      courier,
      sender,
      destination,
    }));

    // ⚠️ 중요: 가이드 팝업을 *먼저* 띄운다.
    // 두 개의 window.open을 연속으로 호출하면 브라우저가 두 번째를 차단하는데,
    // 가이드 팝업(width/height 지정)이 더 차단 대상이 되기 쉬우므로 먼저 열어야 한다.
    const w = 420;
    const h = 660;
    const left = window.screenX + window.outerWidth - w - 20;
    const top = window.screenY + 60;
    const guideWin = window.open(
      '/return-guide',
      'returnGuide',
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    // 팝업 차단 감지
    if (!guideWin || guideWin.closed || typeof guideWin.closed === 'undefined') {
      alert(
        '가이드 팝업이 차단되었습니다.\n\n' +
        '브라우저 주소창 오른쪽의 팝업 차단 아이콘을 클릭해서\n' +
        '"이 사이트의 팝업 허용"을 선택한 후 다시 시도해주세요.',
      );
      return;
    }

    // 가이드 팝업을 앞으로
    guideWin.focus();

    // 택배사 사이트 새 탭 (가이드가 정상적으로 열린 경우에만)
    window.open(urls[courier], '_blank');
  };

  // 우리 창고는 이름(business_name)이 없어도 OK — 택배사 양식은 전화+주소만 필요
  // 공급처는 외부 업체이므로 이름 필수
  const destinationReady = destType === 'warehouse'
    ? destination.phone.trim() && destination.address.trim()
    : destination.name.trim() && destination.phone.trim() && destination.address.trim();
  const isReady = sender.name.trim() && sender.phone.trim() && sender.address.trim() && destinationReady;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <RotateCcw className="w-7 h-7 text-[#E31837]" />
          반품 수거 접수
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          구매자 주소와 도착지를 입력하고, 택배사 사이트에서 간편하게 수거 접수하세요.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ===== 수거지 (구매자) ===== */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-500" />
            수거지 (구매자)
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
          접수 시작 — 택배사 사이트 열기 + 가이드
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
