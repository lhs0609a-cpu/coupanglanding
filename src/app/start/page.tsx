/**
 * /start — 공개 시작 로드맵 (사업자등록 → 상품 업로드).
 *
 * ★ 이 파일이 서버 컴포넌트인 이유:
 *   단계 데이터는 `start-roadmap` → `academy` 로 이어지고, 아카데미 모듈에는
 *   퀴즈 **정답**과 PT 전용(Act 3~5) 콘텐츠, 그리고 판정 함수 pass() 가 들어 있다.
 *   클라이언트 컴포넌트에서 직접 import 하면 그게 전부 공개 번들로 나간다.
 *   여기서 필요한 모양으로 깎아서 props 로만 내려보낸다.
 */

import StartClient from './StartClient';
import { ROADMAP_STEPS, ROADMAP_FAQS } from '@/lib/data/start-roadmap';

export default function StartPage() {
  return <StartClient steps={ROADMAP_STEPS} faqs={ROADMAP_FAQS} />;
}
