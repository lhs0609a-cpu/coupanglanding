/**
 * /start 단계별 **화면 목업** 스키마.
 *
 * ★ 왜 사진이 아니라 데이터인가:
 *   토스·정부24·쿠팡 윙의 실제 캡처를 넣으면 두 가지가 동시에 망가진다.
 *   ① 저쪽 UI 가 바뀌면 우리 화면이 조용히 거짓말을 시작한다(캡처는 아무도 다시 안 찍는다).
 *   ② 남의 화면을 그대로 싣는 문제도 남는다.
 *   그래서 **화면을 코드로 다시 그린다.** 필드 이름·버튼 문구·경고 문장은 진짜 그대로 쓰고
 *   픽셀만 우리가 만든다. 다크 페이지 안에 밝은 화면이 프레임째 들어가니 "이게 그 화면이구나"는
 *   그대로 전달되고, 실제 캡처라고 착각할 소지는 프레임의 "재현 화면" 배지가 막는다.
 *
 * ★ pin 은 **체크리스트 substep id** 다. 목업의 번호와 아래 체크리스트의 번호를 같은 것으로
 *   묶어주는 유일한 끈이라서, 없는 id 를 적으면 그 번호가 조용히 사라진다.
 *   그래서 `scripts/check-start-mockups.mjs` 가 전체 pin 을 검사한다.
 */

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute';

/** 표 한 칸. 문자열이면 평범한 칸, 객체면 색이 붙은 칸. */
export type Cell = string | { t: string; tone?: Tone };

interface Pinnable {
  /** 이 블록이 설명하는 체크리스트 항목 id. 붙이면 왼쪽 여백에 번호가 달린다. */
  pin?: string;
}

export type MockupBlock = Pinnable &
  (
    | { k: 'heading'; text: string; sub?: string }
    | { k: 'text'; text: string; strong?: boolean }
    | {
        k: 'field';
        label: string;
        value?: string;
        ph?: string;
        /** ok=초록 체크, error=빨간 테두리, lock=자동으로 채워진 칸, plain=아무 표시 없음 */
        state?: 'ok' | 'error' | 'lock' | 'plain';
        hint?: string;
      }
    | { k: 'select'; label: string; value: string; hint?: string }
    | { k: 'radio'; label?: string; options: { text: string; note?: string; on?: boolean }[] }
    | { k: 'check'; label?: string; options: { text: string; note?: string; on?: boolean }[] }
    | {
        k: 'btn';
        label: string;
        variant?: 'primary' | 'sec' | 'danger' | 'off';
        align?: 'left' | 'right' | 'full';
      }
    | { k: 'btnrow'; items: { label: string; variant?: 'primary' | 'sec' | 'danger' | 'off' }[] }
    | { k: 'notice'; tone: Tone; title?: string; text: string }
    | { k: 'table'; cols: string[]; rows: Cell[][] }
    | {
        k: 'cards';
        items: {
          name: string;
          price?: string;
          badge?: { t: string; tone: Tone };
          checked?: boolean;
          /** 체크박스가 눌리지 않는 카드 */
          lock?: boolean;
        }[];
      }
    | { k: 'tabs'; items: string[]; active: number }
    | { k: 'gauges'; items: { label: string; pct: number; tone?: Tone }[] }
    | {
        k: 'thumbs';
        items: {
          cap: string;
          kind: 'white' | 'photo' | 'review' | 'box';
          /** 대표로 고른 것 */
          pick?: boolean;
          /** 지울 것 */
          del?: boolean;
        }[];
      }
    /**
     * 진짜 사진 두 장을 나란히 놓고 비교한다.
     * 이미지 고르기는 말로 백 줄 쓰는 것보다 두 장을 붙여 보여주는 게 빠르다.
     */
    | {
        k: 'imgpair';
        items: { src: string; alt: string; cap: string; note?: string; verdict: 'ok' | 'bad' }[];
      }
    | { k: 'chat'; items: { who: 'cs' | 'me' | 'sys'; text: string }[] }
    | { k: 'kv'; items: { k: string; v: string; tone?: Tone; copy?: boolean }[] }
    | { k: 'flow'; items: { text: string; state: 'done' | 'now' | 'todo' }[] }
    | { k: 'upload'; label: string; files?: string[] }
    | { k: 'doc'; title: string; lines: string[]; stamp?: string }
  );

/**
 * 실제 캡처 위에 얹는 번호 배지.
 * 좌표는 이미지 기준 백분율(0~100)이라 화면 폭이 바뀌어도 따라간다.
 */
export interface MockupHotspot {
  /** 체크리스트 substep id. 배지 번호를 여기서 구한다. */
  pin: string;
  x: number;
  y: number;
  label: string;
}

/**
 * **진짜 캡처** 화면.
 *
 * 그림으로 다시 그린 화면과 섞어 쓴다 — 우리가 가진 실제 캡처(쿠팡 윙 입점·API 키 발급·
 * 배송지 관리, 메가로드 카탈로그)는 재현본보다 언제나 낫다. 없는 화면만 그린다.
 */
export interface MockupShotScreen {
  kind: 'shot';
  tab: string;
  src: string;
  alt: string;
  /** 어디서 찍은 화면인가 — 캡처는 늙는다. 출처를 숨기지 않는다. */
  source?: string;
  caption: string;
  hotspots: MockupHotspot[];
}

export interface MockupDrawnScreen {
  kind?: 'drawn';
  /** 화면이 여러 장일 때 전환 탭에 뜨는 짧은 이름 */
  tab: string;
  chrome: 'browser' | 'phone' | 'paper';
  /** 화면 주인 — 프레임 위에 그대로 뜬다 */
  brand?: string;
  url?: string;
  /** 상단 메뉴. 쿠팡 윙처럼 "어느 메뉴인지"가 중요한 화면에만 쓴다. */
  menu?: { items: string[]; active: number };
  /** '마이페이지 > 추가판매정보' 같은 경로 */
  path?: string;
  accent?: 'red' | 'blue' | 'green' | 'gray';
  /** 이 화면이 무엇인지 한 줄. 목업 아래에 붙는 글. */
  caption: string;
  blocks: MockupBlock[];
}

export type MockupScreen = MockupDrawnScreen | MockupShotScreen;

export const isShot = (s: MockupScreen): s is MockupShotScreen => s.kind === 'shot';
