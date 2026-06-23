/**
 * Enter 로 "다음 입력칸"으로 포커스를 옮긴다.
 * data-field-scope 로 감싼 가장 가까운 영역(없으면 document) 안의 입력칸들을
 * 화면 순서대로 모아, 현재 칸의 다음 칸으로 포커스를 이동한다.
 * 옵션값을 한 칸씩 빠르게 채워 넣을 때 마우스 없이 Enter 만으로 진행하기 위함.
 */
export function focusNextField(current: HTMLElement | null) {
  if (!current) return;
  const scope = current.closest('[data-field-scope]') ?? document.body;
  const fields = Array.from(
    scope.querySelectorAll<HTMLElement>(
      'input:not([disabled]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])',
    ),
  ).filter((el) => el.tabIndex !== -1 && el.offsetParent !== null);
  const idx = fields.indexOf(current);
  if (idx === -1) return;
  const next = fields[idx + 1];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
      try { next.select(); } catch { /* number 입력 등 select 불가 타입 무시 */ }
    }
  } else {
    current.blur();
  }
}
