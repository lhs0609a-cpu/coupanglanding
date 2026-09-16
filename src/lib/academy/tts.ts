/**
 * TTS 자산 규약 — 생성기(로컬 배치)와 서빙 라우트가 **같은 규칙**을 써야 한다.
 * 한쪽만 바꾸면 영영 캐시 미스가 나서, 비싸게 만든 mp3 를 아무도 못 듣는다.
 *
 * 설계도 §6 / §16-2:
 *   1순위 — 사전 생성 mp3 (로컬에서 GPT TTS 로 만들어 Storage 에 올린다)
 *   2순위 — 브라우저 speechSynthesis (파일이 없으면 자동 폴백)
 *
 * ★ 프로덕션에는 OPENAI_API_KEY 를 두지 않는다. 생성은 로컬, 서빙은 정적 파일.
 *   운영 중 키 유출·과금·장애 경로가 통째로 사라진다.
 */

import { createHash } from 'crypto';

export const TTS_BUCKET = 'academy-tts';
export const TTS_VOICE = 'nova';        // 목소리는 하나로 고정한다 — 스텝마다 다르면 산만하다
export const TTS_MODEL = 'gpt-4o-mini-tts';

/**
 * 대본 해시. 문장 하나만 고쳐도 값이 달라져 자동으로 재생성 대상이 된다.
 * 공백 정규화를 해두지 않으면 눈에 안 보이는 차이로 매번 재생성된다.
 */
export function narrationHash(lines: string[]): string {
  const normalized = lines.map((l) => l.replace(/\s+/g, ' ').trim()).join('\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
}

export function ttsPath(stepKey: string, hash: string, voice = TTS_VOICE): string {
  return `${stepKey}/${hash}.${voice}.mp3`;
}

/** 문장별 재생 구간 — 자막 하이라이트를 붙이려면 이게 있어야 한다. */
export interface TtsMark {
  index: number;
  startMs: number;
  endMs: number;
}
