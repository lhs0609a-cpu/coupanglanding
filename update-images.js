const fs = require('fs');
const path = require('path');

// ===== Program Page =====
let program = fs.readFileSync(path.join(process.cwd(), 'src/app/program/page.tsx'), 'utf8');

// 1. Replace DashboardMockup component with real Coupang Wing screenshot
const oldDashboardMockup = `function DashboardMockup() {
  const pipelineSteps = [
    { label: '스캔', done: true }, { label: '가격', done: true }, { label: '카테고리', done: true },
    { label: '상품명', done: true }, { label: '리뷰', active: true }, { label: '옵션', done: false },
    { label: '필드', done: false }, { label: '이미지', done: false }, { label: '등록', done: false },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-gradient-to-r from-red-100/50 via-purple-100/25 to-blue-100/50 rounded-[32px] blur-2xl" />
      <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
        <WindowChrome title="쿠팡 자동화 대시보드" />
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[{ label: '오늘 등록', value: '147', change: '+32', up: true }, { label: '대기중', value: '80', change: '', up: false }, { label: '성공률', value: '98.2%', change: '+0.4%', up: true }].map((s) => (
              <div key={s.label} className="bg-gray-50/80 rounded-xl p-3 border border-gray-100/50">
                <div className="text-[10px] font-medium text-gray-400 mb-1">{s.label}</div>
                <div className="text-lg font-bold text-gray-900 leading-none">{s.value}</div>
                {s.change && <div className="flex items-center gap-0.5 mt-1"><TrendingUp className="w-2.5 h-2.5 text-green-500" /><span className="text-[10px] font-semibold text-green-600">{s.change}</span></div>}
              </div>
            ))}
          </div>
          <div className="bg-gradient-to-r from-red-50/80 to-orange-50/60 rounded-xl p-4 border border-red-100/60">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#E31837] animate-pulse" /><span className="text-sm font-semibold text-gray-800">자동 등록 진행중</span></div>
              <span className="text-[11px] font-bold text-[#E31837] bg-white px-2.5 py-0.5 rounded-full border border-red-100">5/9 단계</span>
            </div>
            <div className="flex gap-1">
              {pipelineSteps.map((step, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className={\`w-full h-1.5 rounded-full \${step.done ? 'bg-[#E31837]' : step.active ? 'bg-[#E31837]/70 animate-pulse' : 'bg-gray-200/80'}\`} />
                  <span className="text-[7px] font-medium text-gray-400 leading-none whitespace-nowrap">{step.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">최근 등록</div>
            <div className="space-y-1.5">
              {[{ name: '도브 컨디셔너 인텐스 리페어 660ml', cat: '헤어케어', price: '₩46,300' }, { name: '꽃을든남자 레드플로로 동백 헤어 컨디셔너', cat: '헤어케어', price: '₩19,400' }, { name: '모로칸샴푸 모이스처 리페어 컨디셔너 1L', cat: '헤어케어', price: '₩98,000' }].map((p, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-gray-100">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100"><ImageIcon className="w-4 h-4 text-gray-300" /></div>
                  <div className="flex-1 min-w-0"><div className="text-[11px] font-medium text-gray-800 truncate">{p.name}</div><div className="text-[10px] text-gray-400 mt-0.5">{p.cat}</div></div>
                  <div className="text-[11px] font-bold text-gray-700 flex-shrink-0">{p.price}</div>
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 }}
        className="absolute -right-3 top-14 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10">
        <div className="w-8 h-8 rounded-full bg-green-50 border border-green-100 flex items-center justify-center"><Check className="w-4 h-4 text-green-600" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">등록 완료!</div><div className="text-[10px] text-gray-400">147개 상품 쿠팡 등록</div></div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6 }}
        className="absolute -left-3 bottom-24 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10">
        <div className="w-8 h-8 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center"><Sparkles className="w-4 h-4 text-purple-600" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">AI 매칭 완료</div><div className="text-[10px] text-gray-400">정확도 94.2%</div></div>
      </motion.div>
    </div>
  );
}`;

const newDashboardMockup = `function DashboardMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-gradient-to-r from-red-100/50 via-purple-100/25 to-blue-100/50 rounded-[32px] blur-2xl" />
      <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
        <WindowChrome title="쿠팡 윙 판매자센터" />
        <img
          src="https://cdn.prod.website-files.com/6875ff5707fb9eff8f996368/688c1ad3f839e5aa4618a9ef_%EC%9C%99-%EC%BD%98%ED%85%90%EC%B8%A0-%EC%9D%B4%EB%AF%B8%EC%A7%80.jpg"
          alt="쿠팡 윙 판매자센터 대시보드 - 매출 현황, 주문 관리, 상품 등록 화면"
          className="w-full"
          loading="eager"
        />
      </div>
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 }}
        className="absolute -right-3 top-14 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10">
        <div className="w-8 h-8 rounded-full bg-green-50 border border-green-100 flex items-center justify-center"><Check className="w-4 h-4 text-green-600" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">등록 완료!</div><div className="text-[10px] text-gray-400">147개 상품 쿠팡 등록</div></div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6 }}
        className="absolute -left-3 bottom-24 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10">
        <div className="w-8 h-8 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center"><Sparkles className="w-4 h-4 text-purple-600" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">AI 매칭 완료</div><div className="text-[10px] text-gray-400">정확도 94.2%</div></div>
      </motion.div>
    </div>
  );
}`;

if (program.includes(oldDashboardMockup)) {
  program = program.replace(oldDashboardMockup, newDashboardMockup);
  console.log('[Program] DashboardMockup replaced with real Wing screenshot');
} else {
  console.log('[Program] WARNING: DashboardMockup not found for replacement');
}

// 2. Replace ScreenMockupsSection tabs with real screenshots
const oldScreenSection = `{activeTab === 0 && (
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
              <WindowChrome title="네이버 → 쿠팡 자동 변환기" />
              <div className="p-6 sm:p-8 space-y-6">
                <div><label className="text-sm font-semibold text-gray-700 mb-2 block">네이버 스마트스토어 URL</label>
                  <div className="flex gap-2"><div className="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-500 font-mono truncate">https://smartstore.naver.com/example/products/12345678</div>
                    <div className="px-5 py-3 rounded-xl bg-[#E31837] text-white text-sm font-semibold flex items-center gap-1.5 flex-shrink-0"><RefreshCw className="w-4 h-4" />변환</div></div>
                </div>
                <div className="bg-emerald-50/50 rounded-xl p-5 border border-emerald-100">
                  <div className="flex items-center gap-2 mb-4"><CheckCircle className="w-5 h-5 text-emerald-600" /><span className="text-sm font-bold text-emerald-700">변환 완료!</span></div>
                  <div className="space-y-3">
                    {[{ label: '상품 정보 추출 완료', time: '3.2초' }, { label: 'AI 카테고리 매칭', time: '정확도 94%' }, { label: 'SEO 상품명 생성 완료', time: '완료' }, { label: '마진 기반 가격 자동 계산', time: '완료' }, { label: '이미지 12장 다운로드 완료', time: '완료' }].map((r, i) => (
                      <div key={i} className="flex items-center justify-between"><div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-sm text-gray-700">{r.label}</span></div><span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">{r.time}</span></div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3"><div className="flex-1 py-3 rounded-xl bg-[#E31837] text-white text-sm font-semibold text-center">쿠팡 등록하기</div><div className="px-6 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold text-center">수정하기</div></div>
              </div>
            </div>
          )}`;

const newScreenSection = `{activeTab === 0 && (
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
              <WindowChrome title="쿠팡 윙 - 상품 등록" />
              <img
                src="https://cdn.prod.website-files.com/6875ff5707fb9eff8f996368/688c1b7587ddf90a97421004_%EC%9C%99-%EC%BD%98%ED%85%90%EC%B8%A0-%EC%9D%B4%EB%AF%B8%EC%A7%80-4.jpg"
                alt="쿠팡 윙 상품 등록 메뉴 - 상품관리, 주문배송, 정산, 광고 등 전체 메뉴 구조"
                className="w-full"
                loading="lazy"
              />
            </div>
          )}`;

if (program.includes(oldScreenSection)) {
  program = program.replace(oldScreenSection, newScreenSection);
  console.log('[Program] ScreenMockups tab 0 replaced');
} else {
  console.log('[Program] WARNING: ScreenMockups tab 0 not found');
}

// Tab 1 - AI 상품명 → Product registration screenshot
const oldTab1Start = '{activeTab === 1 && (\n            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">\n              <WindowChrome title="AI 상품명 & 검색태그 생성기" />';
const oldTab1End = '            </div>\n          )}';

// Find and replace tab 1
const tab1Pattern = /\{activeTab === 1 && \(\n\s+<div className="bg-white rounded-2xl border border-gray-200\/80 shadow-2xl overflow-hidden">\n\s+<WindowChrome title="AI 상품명 & 검색태그 생성기"[\s\S]*?<\/div>\n\s+<\/div>\n\s+\)\}/;
const newTab1 = `{activeTab === 1 && (
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
              <WindowChrome title="쿠팡 윙 - 상품 관리 대시보드" />
              <img
                src="https://cdn.prod.website-files.com/6875ff5707fb9eff8f996368/688c1b4c10d8b8b95b6a5e88_49a5058d60e0b02956a24c15e42be2fb_%EC%9C%99-%EC%BD%98%ED%85%90%EC%B8%A0-%EC%9D%B4%EB%AF%B8%EC%A7%80-2.jpg"
                alt="쿠팡 윙 상품 관리 대시보드 - 실시간 매출, 주문현황, 상품 목록 관리 화면"
                className="w-full"
                loading="lazy"
              />
            </div>
          )}`;

if (tab1Pattern.test(program)) {
  program = program.replace(tab1Pattern, newTab1);
  console.log('[Program] ScreenMockups tab 1 replaced');
} else {
  console.log('[Program] WARNING: ScreenMockups tab 1 not found');
}

// Tab 2 - 가격 계산 → Settlement/Analytics screenshot
const tab2Pattern = /\{activeTab === 2 && \(\n\s+<div className="bg-white rounded-2xl border border-gray-200\/80 shadow-2xl overflow-hidden">\n\s+<WindowChrome title="자동 가격 계산기"[\s\S]*?<\/div>\n\s+<\/div>\n\s+\)\}/;
const newTab2 = `{activeTab === 2 && (
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
              <WindowChrome title="쿠팡 윙 - 정산 & 매출 분석" />
              <img
                src="https://cdn.prod.website-files.com/6875ff5707fb9eff8f996368/688c1b86eb717de97ea44fc8_%EC%9C%99-%EC%BD%98%ED%85%90%EC%B8%A0-%EC%9D%B4%EB%AF%B8%EC%A7%80-6.jpg"
                alt="쿠팡 윙 정산 화면 - 매출 분석, 정산 내역, 수익 그래프"
                className="w-full"
                loading="lazy"
              />
            </div>
          )}`;

if (tab2Pattern.test(program)) {
  program = program.replace(tab2Pattern, newTab2);
  console.log('[Program] ScreenMockups tab 2 replaced');
} else {
  console.log('[Program] WARNING: ScreenMockups tab 2 not found');
}

// 3. Update tab labels to match new screenshots
program = program.replace(
  "const tabs = ['네이버 → 쿠팡 변환', 'AI 상품명 생성', '자동 가격 계산'];",
  "const tabs = ['상품 등록', '매출 관리', '정산 분석'];"
);
console.log('[Program] Tab labels updated');

fs.writeFileSync(path.join(process.cwd(), 'src/app/program/page.tsx'), program);
console.log('[Program] File saved');

// ===== PT Page =====
let pt = fs.readFileSync(path.join(process.cwd(), 'src/app/pt/page.tsx'), 'utf8');

// Replace CoupangSellerDashboard CSS mockup with real screenshot
const ptDashboardPattern = /function CoupangSellerDashboard\(\) \{[\s\S]*?^}/m;
const newPtDashboard = `function CoupangSellerDashboard() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-gradient-to-r from-rose-100/50 via-purple-100/30 to-blue-100/50 rounded-[32px] blur-2xl" />
      <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
        <WindowChrome title="쿠팡 윙 판매자센터" />
        <img
          src="https://cdn.prod.website-files.com/6875ff5707fb9eff8f996368/688c1b86eb717de97ea44fc8_%EC%9C%99-%EC%BD%98%ED%85%90%EC%B8%A0-%EC%9D%B4%EB%AF%B8%EC%A7%80-6.jpg"
          alt="쿠팡 윙 판매자센터 - 매출 현황, 정산 분석, 수익 그래프 실제 화면"
          className="w-full"
          loading="eager"
        />
      </div>
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 }}
        className="absolute -right-3 top-14 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10 hidden sm:flex">
        <div className="w-8 h-8 rounded-full bg-green-50 border border-green-100 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-green-600" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">매출 달성!</div><div className="text-[10px] text-gray-400">월 1,245만원 돌파</div></div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6 }}
        className="absolute -left-3 bottom-24 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10 hidden sm:flex">
        <div className="w-8 h-8 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center"><Star className="w-4 h-4 text-purple-600" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">PT 효과</div><div className="text-[10px] text-gray-400">47일 만에 첫 매출</div></div>
      </motion.div>
    </div>
  );
}`;

if (ptDashboardPattern.test(pt)) {
  pt = pt.replace(ptDashboardPattern, newPtDashboard);
  console.log('[PT] CoupangSellerDashboard replaced with real screenshot');
} else {
  console.log('[PT] WARNING: CoupangSellerDashboard not found');
}

fs.writeFileSync(path.join(process.cwd(), 'src/app/pt/page.tsx'), pt);
console.log('[PT] File saved');

console.log('\n=== Done! ===');
