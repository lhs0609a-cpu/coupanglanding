/**
 * 내부 스택 이름 마스킹 — 화면·로그에 어떤 엔진/모델을 쓰는지 드러내지 않는다(영업비밀).
 * ---------------------------------------------------------------------------
 * 왜 여기서 하나: 앱 화면에 뜨는 문자열은 전부 main.mjs 의 `send()` 한 곳을 지나간다.
 *   러너가 그대로 흘려보내는 워커 stdout(수백 줄의 console.log)까지 포함되므로,
 *   개별 로그 문구를 하나씩 고치는 대신 출구에서 한 번 치환하는 편이 빠지는 데가 없다.
 *   (과거 버전 워커가 뱉는 옛 문구도 자동으로 가려진다.)
 *
 * 기능 이름은 남긴다 — 사용자는 "누끼 엔진 가동 중"처럼 무엇을 하는 중인지는 알아야 한다.
 */

/** [정규식, 대체어] — 긴 이름부터(부분 치환으로 조각이 남지 않게). */
const RULES = [
  // 이미지 인식(VLM) 계열
  [/qwen\s*2?\.?5?\s*-?\s*vl(?::[\w.-]+)?/gi, '이미지 인식 모델'],
  [/\bllava(?::[\w.-]+)?/gi, '이미지 인식 모델'],
  // 이미지 생성/누끼 계열
  [/\bcomfy\s*ui\b/gi, '누끼 엔진'],
  [/\bcomfy\b/gi, '누끼 엔진'],
  [/\bsdxl\b/gi, '이미지 생성 모델'],
  [/\bbirefnet\b/gi, '배경제거 모델'],
  [/\brembg\b/gi, '배경제거'],
  // 텍스트 생성 계열
  [/\bollama\b/gi, '텍스트 엔진'],
  [/\bclip\b/gi, '이미지 분류'],
  [/\bhugging\s*face\b/gi, '모델 저장소'],
  [/\btransformers\.js\b/gi, '추론 라이브러리'],
  // 남은 모델 태그(gemma2:9b, llama3.1:8b, exaone3.5:7.8b 등) — 이름:크기 형태를 통째로
  [/\b[a-z][a-z0-9.]*\d*(?:-[a-z0-9.]+)*:\d+(?:\.\d+)?b\b/gi, 'AI 모델'],
  // 기본 포트도 지문이 된다(8188=누끼, 11434=텍스트). 주소 전체를 뭉갠다.
  [/(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|0\.0\.0\.0):(?:8188|11434)\b/gi, '로컬 엔진 주소'],
];

/** 문자열에서 내부 엔진·모델 이름을 기능 이름으로 치환. 문자열이 아니면 그대로 반환. */
export function maskInternalNames(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out;
}

/** 렌더러로 보내는 payload 마스킹 — 문자열이면 그대로, 객체면 사람이 읽는 필드만. */
const TEXT_KEYS = ['reason', 'message', 'error', 'detail', 'text', 'line', 'log', 'label', 'current'];

export function maskPayload(payload) {
  if (typeof payload === 'string') return maskInternalNames(payload);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  let copy = null;
  for (const k of TEXT_KEYS) {
    if (typeof payload[k] === 'string') {
      const masked = maskInternalNames(payload[k]);
      if (masked !== payload[k]) {
        copy = copy || { ...payload };
        copy[k] = masked;
      }
    }
  }
  return copy || payload;
}
