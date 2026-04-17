const fs = require('fs');
const filePath = 'src/lib/megaload/services/content-profile-resolver.ts';
let content = fs.readFileSync(filePath, 'utf8');

const ALL_INGREDIENTS = [
  '오메가3','루테인','비오틴','콜라겐','유산균','프로바이오틱스',
  '밀크씨슬','밀크시슬','홍삼','마그네슘','칼슘','글루코사민',
  '히알루론산','코엔자임','크릴오일','프로폴리스','쏘팔메토',
  '엽산','가르시니아','스피루리나','클로렐라','흑마늘',
  '비타민A','비타민B','비타민C','비타민D','비타민E','비타민K',
  '철분','아연','셀레늄','보스웰리아','MSM','진세노사이드',
  '프로틴','단백질','WPC','CLA','카테킨','비타민B군','비타민B7',
  '간건강','눈건강','관절건강','장건강','체지방감소','피부탄력',
  '연골보호','전립선','모발건강','혈당관리','혈관건강','면역력',
  '뼈건강','수면개선','배변활동','소화흡수','유익균',
  '장내환경','심장건강','근력강화','전립선건강',
  '눈피로','시력보호','황반건강',
  '간보호','간해독','간기능',
  '콘드로이친','관절유연성','관절편안함',
  '혈행개선','중성지방','콜레스테롤',
  '식욕억제','지방분해','대사촉진',
  '근육회복','단백질보충','운동능력',
];

const PROFILE_OWN = {
  '관절': ['글루코사민','콘드로이친','MSM','보스웰리아','칼슘','비타민D','콜라겐','히알루론산','관절건강','연골보호','관절유연성','뼈건강','관절편안함'],
  '간건강': ['밀크씨슬','밀크시슬','비타민B군','간건강','간보호','간해독','간기능'],
  '눈건강': ['루테인','비타민A','아연','비타민E','눈건강','시력보호','눈피로','황반건강'],
  '유산균': ['유산균','프로바이오틱스','장건강','소화흡수','장내환경','유익균','배변활동'],
  '오메가3': ['오메가3','크릴오일','비타민E','비타민D','혈관건강','혈행개선','중성지방','콜레스테롤'],
  '홍삼면역': ['홍삼','진세노사이드','프로폴리스','아연','비타민C','셀레늄','면역력'],
  '콜라겐': ['콜라겐','히알루론산','비타민C','비타민E','코엔자임','피부탄력'],
  '비타민': ['비타민C','비타민D','비타민B군','비타민B','비타민E','비타민A','비타민K','비타민B7','엽산','비오틴','면역력','뼈건강'],
  '미네랄': ['마그네슘','칼슘','아연','셀레늄','철분','비타민D','비타민K','뼈건강','수면개선','면역력'],
  '비오틴': ['비오틴','비타민B7','아연','셀레늄','비타민E','비타민C','엽산','모발건강','피부탄력'],
  '엽산': ['엽산','철분','비타민D','칼슘','아연','비타민C','마그네슘','면역력'],
  '코엔자임': ['코엔자임','비타민E','셀레늄','오메가3','비타민B군','마그네슘','심장건강','혈관건강'],
  '쏘팔메토': ['쏘팔메토','아연','셀레늄','비타민E','전립선','전립선건강'],
  '다이어트': ['가르시니아','CLA','카테킨','체지방감소','식욕억제','대사촉진','지방분해'],
  '프로틴': ['WPC','프로틴','단백질','근력강화','근육회복','단백질보충','운동능력'],
  '스피루리나': ['스피루리나','클로렐라','철분','단백질','아연','면역력'],
  '흑마늘': ['흑마늘','셀레늄','아연','면역력','혈관건강'],
};

let updated = 0;
for (const [profileKey, ownTerms] of Object.entries(PROFILE_OWN)) {
  const ownSet = new Set(ownTerms.map(s => s.toLowerCase()));
  const forbidden = ALL_INGREDIENTS.filter(t => !ownSet.has(t.toLowerCase()));

  const label = "건강식품::" + profileKey;
  // Match: '건강식품::XXX': { ... forbiddenTerms: [...] }
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp("('" + escapedLabel + "'[\\s\\S]*?forbiddenTerms:\\s*\\[)[^\\]]*\\]");

  const replacement = forbidden.map(t => "'" + t + "'").join(', ');
  const newContent = content.replace(re, (m, prefix) => prefix + replacement + ']');
  if (newContent !== content) {
    content = newContent;
    updated++;
    console.log(`  Updated ${label}: ${forbidden.length} forbidden terms`);
  } else {
    console.log(`  SKIP ${label}: pattern not found`);
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`\nDone: ${updated}/${Object.keys(PROFILE_OWN).length} profiles updated`);
