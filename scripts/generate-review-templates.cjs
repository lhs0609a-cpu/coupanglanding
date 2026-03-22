/**
 * generate-review-templates.cjs
 *
 * GPT-4o-mini로 소분류별 완성형 후기 템플릿 20개씩 생성.
 * 소분류 특화: 넥크림은 목주름 이야기, 샴푸는 두피 이야기.
 */
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'full-review-templates.json');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// SEO 키워드 풀의 소분류 목록 + 상품 설명
const SUBCATEGORIES = {
  '뷰티>스킨>크림': '수분크림, 보습크림, 영양크림, 재생크림 등 페이스크림',
  '뷰티>스킨>크림>넥크림': '목주름크림, 넥케어, 목탄력, 데콜테크림',
  '뷰티>스킨>에센스/세럼': '에센스, 세럼, 앰플, 부스터',
  '뷰티>스킨>스킨/토너': '스킨, 토너, 화장수, 토너패드',
  '뷰티>스킨>마스크/팩': '마스크팩, 시트마스크, 슬리핑팩, 워시오프팩',
  '뷰티>스킨>선케어': '선크림, 자외선차단제, 선스틱, 톤업선크림',
  '뷰티>스킨>클렌징': '클렌징폼, 클렌징오일, 클렌징워터, 클렌징밤',
  '뷰티>메이크업>베이스메이크업': '파운데이션, 쿠션, BB크림, CC크림, 프라이머',
  '뷰티>메이크업>아이메이크업': '아이섀도, 아이라이너, 마스카라, 아이브로우',
  '뷰티>메이크업>립메이크업': '립스틱, 립틴트, 립글로스, 립밤',
  '뷰티>바디>바디케어': '바디로션, 바디크림, 바디워시, 핸드크림',
  '뷰티>헤어>샴푸': '탈모샴푸, 두피샴푸, 비듬샴푸, 볼륨샴푸',
  '식품>건강식품>비타민': '비타민C, 비타민D, 멀티비타민, 종합비타민',
  '식품>건강식품>오메가3': '오메가3, EPA, DHA, rTG오메가3, 크릴오일',
  '식품>건강식품>유산균': '유산균, 프로바이오틱스, 장건강, 락토바실러스',
  '식품>건강식품>콜라겐': '콜라겐, 저분자콜라겐, 먹는콜라겐, 이너뷰티',
  '식품>건강식품>루테인': '루테인, 눈영양제, 눈건강, 지아잔틴',
  '식품>건강식품>밀크씨슬': '밀크씨슬, 간건강, 실리마린, 간영양제',
  '식품>건강식품>홍삼': '홍삼, 홍삼정, 홍삼액, 면역력, 피로회복',
  '식품>건강식품>프로틴': '프로틴, 단백질, 프로틴파우더, 유청단백',
  '식품>건강식품>칼슘': '칼슘, 뼈건강, 칼슘마그네슘, 골밀도',
  '식품>건강식품>마그네슘': '마그네슘, 눈떨림, 근육경련, 숙면',
  '생활용품>세제>세탁세제': '세탁세제, 액체세제, 캡슐세제, 섬유유연제',
  '생활용품>세제>주방세제': '주방세제, 식기세척기세제, 과일야채세정제',
  '생활용품>건강용품': '혈압계, 안마기, 마사지건, 찜질팩, 보호대',
  '생활용품>욕실용품': '칫솔, 치약, 전동칫솔, 샤워기, 수건',
  '생활용품>수납/정리': '수납함, 정리함, 옷걸이, 리빙박스, 압축팩',
  '가전/디지털>청소가전': '무선청소기, 로봇청소기, 물걸레청소기',
  '가전/디지털>주방가전': '에어프라이어, 전자레인지, 밥솥, 믹서기',
  '가전/디지털>계절가전': '에어컨, 선풍기, 서큘레이터, 제습기, 가습기',
  '가전/디지털>영상가전': 'TV, 모니터, 사운드바, 블루투스스피커',
  '가전/디지털>컴퓨터': '노트북, 키보드, 마우스, SSD, 모니터',
  '패션의류잡화>여성의류': '원피스, 블라우스, 니트, 코트, 청바지',
  '패션의류잡화>남성의류': '셔츠, 슬랙스, 자켓, 맨투맨, 청바지',
  '패션의류잡화>신발': '운동화, 스니커즈, 로퍼, 부츠, 샌들',
  '패션의류잡화>가방': '백팩, 크로스백, 토트백, 에코백, 캐리어',
  '가구/홈데코>침대': '침대, 매트리스, 토퍼, 접이식침대',
  '가구/홈데코>소파': '소파, 리클라이너, 소파베드, 1인소파',
  '가구/홈데코>책상': '컴퓨터책상, 학생책상, 스탠딩데스크, 게이밍데스크',
  '가구/홈데코>의자': '사무용의자, 게이밍의자, 학생의자, 메쉬의자',
  '출산/유아동>기저귀': '기저귀, 팬티기저귀, 밴드기저귀, 신생아기저귀',
  '출산/유아동>분유': '분유, 산양분유, 유기농분유, 젖병',
  '출산/유아동>유아식품': '이유식, 아기과자, 유아간식, 아기비타민',
  '스포츠/레져>헬스': '덤벨, 아령, 요가매트, 폼롤러, 풀업바',
  '스포츠/레져>골프': '골프공, 골프채, 골프장갑, 거리측정기',
  '스포츠/레져>캠핑': '텐트, 캠핑의자, 침낭, 랜턴, 버너',
  '주방용품>프라이팬': '프라이팬, 후라이팬, 그릴팬, 에그팬',
  '주방용품>냄비': '냄비, 스테인리스냄비, 압력솥, 전골냄비',
  '주방용품>칼/도마': '칼, 식칼, 도마, 칼세트, 가위',
  '주방용품>컵/텀블러': '텀블러, 보온텀블러, 머그컵, 유리컵',
  '반려/애완용품>강아지사료': '강아지사료, 그레인프리, 유기농사료',
  '반려/애완용품>강아지간식': '강아지간식, 져키, 덴탈껌, 동결건조',
  '반려/애완용품>고양이': '고양이사료, 캣푸드, 캣타워, 모래',
};

async function callGPT(prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.9, max_tokens: 16000 }),
  });
  if (!res.ok) throw new Error(`GPT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).choices[0].message.content;
}

async function main() {
  if (!OPENAI_API_KEY) { console.error('OPENAI_API_KEY 필요'); process.exit(1); }

  let result = {};
  if (fs.existsSync(OUTPUT)) {
    try { result = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
  }

  const entries = Object.entries(SUBCATEGORIES);
  let done = 0;

  for (const [subcat, products] of entries) {
    const existing = result[subcat];
    if (Array.isArray(existing) && existing.length >= 20) {
      console.log(`✓ ${subcat}: ${existing.length}개 이미 있음`);
      done++;
      continue;
    }

    const templates = Array.isArray(existing) ? [...existing] : [];
    const needed = 20 - templates.length;
    const batches = Math.ceil(needed / 10);

    for (let b = 0; b < batches; b++) {
      const prompt = `쿠팡 "${subcat}" 카테고리 상품의 완성형 구매 후기 10개를 JSON 배열로 만들어주세요.

대상 상품: ${products}

## 규칙
1. 한 사람이 처음부터 끝까지 쓴 자연스러운 후기 (광고 아닌 진짜 구매자 톤)
2. 5~7문단, 문단 사이를 \\n\\n으로 구분
3. 이 소분류 상품에 맞는 구체적인 내용 (예: 넥크림이면 목주름, 샴푸면 두피)
4. 변수: {product}, {효과1}, {효과2}, {사용법}, {사용감}, {기간}, {횟수}, {성분}, {추천대상}, {가격대}, {카테고리}, {인증}, {용량}, {수치}, {계절}
5. 각 후기마다 완전히 다른 상황/스토리 (본인사용/선물/가족/직장/비교/재구매/시즌 등)
6. 배치 ${b + 1}: 이전과 다른 새로운 상황
7. 이모지는 마지막 문단에만 1개

JSON 배열만 출력: ["후기1\\n\\n문단2\\n\\n문단3", "후기2...", ...]`;

      try {
        const raw = await callGPT(prompt);
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          templates.push(...parsed.filter(t => typeof t === 'string' && t.length > 100));
        }
        console.log(`  ${subcat} 배치${b + 1}: +${templates.length - (Array.isArray(existing) ? existing.length : 0)}개`);
      } catch (err) {
        console.error(`  ${subcat} 배치${b + 1} 실패:`, err.message);
      }
      await new Promise(r => setTimeout(r, 300));
    }

    result[subcat] = templates.slice(0, 20);
    done++;
    console.log(`[${done}/${entries.length}] ${subcat}: ${result[subcat].length}개`);

    // 중간 저장
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf8');
  }

  // 통계
  console.log('\n=== 완료 ===');
  let total = 0;
  for (const [cat, temps] of Object.entries(result)) {
    if (!Array.isArray(temps)) continue;
    total += temps.length;
    console.log(`  ${cat}: ${temps.length}개`);
  }
  console.log(`총: ${total}개 템플릿`);
}

main().catch(err => { console.error(err); process.exit(1); });
