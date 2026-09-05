/**
 * worker/desktop/RELEASE_NOTES.md 에서 한 버전의 "업데이트 소식"을 뽑아 stdout 으로 낸다.
 *
 * 왜 스크립트인가: 릴리스 워크플로가 **빌드 전에** 이걸 돌려서, 이번 버전의 소식이 없으면
 *   릴리스를 아예 막는다. 자동 업데이트라 앱은 조용히 새 버전이 되는데, 무엇이 좋아졌는지
 *   알려 주지 않으면 좋아지지 않은 것과 같다. 사람 기억에 맡기면 반드시 빠지므로 CI 가 강제한다.
 *
 * 사용: node scripts/extract-release-notes.mjs 0.4.3
 * 실패(섹션 없음/본문 빈 값)하면 종료코드 1 + stderr 에 사유.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const NOTES_PATH = join(here, '..', 'worker', 'desktop', 'RELEASE_NOTES.md');

const version = String(process.argv[2] || '').trim().replace(/^v/i, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('사용법: node scripts/extract-release-notes.mjs <버전>  (예: 0.4.3)');
  process.exit(1);
}

let md;
try {
  md = readFileSync(NOTES_PATH, 'utf8');
} catch (e) {
  console.error(`❌ ${NOTES_PATH} 를 읽을 수 없습니다: ${e.message}`);
  process.exit(1);
}

// `## v0.4.3` 줄부터 다음 `## ` 줄 직전까지.
//   ⚠️ 정규식으로 "다음 헤딩 또는 파일 끝"을 잡으려다 \Z 를 썼는데 JS 엔 없는 문법이라
//      항상 매칭 실패했다(= 모든 버전이 "섹션 없음"). 줄 단위로 자르면 그런 함정이 없다.
const lines = md.split(/\r?\n/);
const start = lines.findIndex((l) => l.trim() === `## v${version}`);
const rest = start >= 0 ? lines.slice(start + 1) : [];
const endRel = rest.findIndex((l) => /^##\s/.test(l));
const body = (endRel >= 0 ? rest.slice(0, endRel) : rest).join('\n').trim();

if (!body) {
  console.error(
    `❌ RELEASE_NOTES.md 에 "## v${version}" 섹션이 없습니다.\n`
    + `   릴리스 전에 이 버전에서 무엇이 좋아졌는지 **사용자 말로** 써 주세요.\n`
    + `   (개발자 용어·파일명·엔진 이름은 쓰지 않습니다 — 파일 상단 규칙 참고)\n`
    + `   파일: worker/desktop/RELEASE_NOTES.md`,
  );
  process.exit(1);
}

process.stdout.write(body);
