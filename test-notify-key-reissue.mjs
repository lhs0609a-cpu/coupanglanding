// 쿠팡 API 키 문제로 대리 등록이 막힌 셀러에게 인앱 알림을 보낸다.
// 사유별로 조치 방법이 다르므로 문구를 나눈다.
//
// 사용: node test-notify-key-reissue.mjs [--send]   (--send 없으면 미리보기만)
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const SEND = process.argv.includes('--send');
const EGRESS = process.env.NEXT_PUBLIC_MEGALOAD_EGRESS_IPS || '';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const WING = 'wing.coupang.com → 우측 상단 판매자명 → [추가판매정보] → OPEN API 키 발급';

function classify(err) {
  const e = String(err || '');
  if (/not allowed for this request/i.test(e)) return 'ip';
  if (/expired/i.test(e)) return 'expired';
  if (/revoked/i.test(e)) return 'revoked';
  if (/Invalid signature/i.test(e)) return 'signature';
  if (/account status change/i.test(e)) return 'account';
  if (/등록되지 않았습니다/.test(e)) return 'missing';
  return 'other';
}

const MSG = {
  missing: {
    title: '쿠팡 API 키를 등록해 주세요',
    message: `메가로드가 상품을 등록하려면 쿠팡 Open API 키가 필요합니다.\n\n발급: ${WING}\n발급 후 [채널관리] 화면에서 업체코드(Vendor ID)·Access Key·Secret Key 3개를 입력하세요.\n\n※ 사업자 인증을 마친 판매자만 발급됩니다.`,
  },
  expired: {
    title: '쿠팡 API 키가 만료됐습니다 — 재발급 필요',
    message: `API 키 유효기간(180일)이 지나 연동이 끊겼습니다.\n\n재발급: ${WING} → 해당 행의 [재발급] 클릭\n새로 나온 Access Key·Secret Key를 [채널관리]에 다시 입력하세요.\n\n※ Secret Key는 발급 시 한 번만 보입니다. 바로 복사하세요.`,
  },
  revoked: {
    title: '쿠팡 API 키가 폐기됐습니다 — 재발급 필요',
    message: `키가 쿠팡에서 폐기된 상태입니다.\n\n재발급: ${WING} → [발급] 또는 [재발급]\n새 Access Key·Secret Key를 [채널관리]에 입력하세요.`,
  },
  signature: {
    title: '쿠팡 API 키 정보가 맞지 않습니다',
    message: `입력된 키로 쿠팡 인증이 되지 않습니다(서명 오류). 키가 잘못 복사됐을 가능성이 큽니다.\n\n${WING} 에서 값을 다시 확인해 [채널관리]에 재입력해 주세요.\n앞뒤 공백이나 줄바꿈이 섞이지 않았는지 확인이 필요합니다.`,
  },
  ip: {
    title: '쿠팡 API 허용 IP 등록이 필요합니다',
    message: `키는 정상이지만 호출 IP가 차단돼 있습니다.\n\n${WING} 의 허용 IP 목록에 아래 주소를 추가해 주세요.\n\n허용 IP: ${EGRESS}\n\n[채널관리] 화면에서도 같은 IP를 확인하실 수 있습니다.`,
  },
  account: {
    title: '쿠팡 계정 상태로 API가 제한됐습니다',
    message: `쿠팡에서 "계정 상태 변경으로 API 접근이 제한됨"으로 응답하고 있습니다. 키 재발급으로는 풀리지 않습니다.\n\n쿠팡 판매자 고객센터에 계정 상태를 문의해 주세요. 판매 정지나 휴면 전환 여부를 확인하셔야 합니다.`,
  },
  other: {
    title: '쿠팡 API 연동을 확인해 주세요',
    message: `쿠팡 API 호출이 실패하고 있습니다.\n\n${WING} 에서 키를 재발급한 뒤 [채널관리]에 다시 입력해 주세요.`,
  },
};

const { data: users } = await supabase
  .from('megaload_users')
  .select('id, profile_id, coupang_shipping_error')
  .not('coupang_shipping_error', 'is', null)
  .limit(500);

const targets = (users || []).filter((u) => u.profile_id);
console.log(`${SEND ? '★ 발송' : '미리보기'} — 대상 ${targets.length}명\n`);

const byKind = {};
for (const u of targets) {
  const k = classify(u.coupang_shipping_error);
  (byKind[k] ||= []).push(u);
}

let sent = 0;
for (const [kind, list] of Object.entries(byKind)) {
  const m = MSG[kind] || MSG.other;
  console.log(`[${kind}] ${list.length}명 — "${m.title}"`);
  console.log(`   ${m.message.split('\n')[0]}`);
  if (SEND) {
    const { error } = await supabase.from('notifications').insert(
      list.map((u) => ({
        user_id: u.profile_id,
        type: 'system',
        title: m.title,
        message: m.message,
        link: '/megaload/channels',
      })),
    );
    if (error) console.log(`   ✘ 발송 실패: ${error.message}`);
    else { sent += list.length; console.log(`   ✔ ${list.length}건 발송`); }
  }
  console.log('');
}

console.log(SEND ? `총 ${sent}건 발송 완료` : '실제로 보내려면 --send 를 붙이세요.');
