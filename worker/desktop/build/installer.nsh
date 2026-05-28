; 메가로드 도우미 설치기 커스텀 — 설치/업데이트 시작 시 실행 중인 "충돌 프로그램"을 모두 종료.
; (앱이 켜져 있으면 파일이 잠겨 설치가 중간에 실패하는 문제 방지)
; electron-builder NSIS 가 nsis.include 로 이 파일을 !include 하고, 아래 매크로들을 호출한다.
;
; ⚠️ nsExec::Exec 는 호출마다 반환값(종료코드)을 NSIS 스택에 push 한다.
;    Pop 으로 꺼내지 않으면 스택이 오염돼 이후 설치 로직이 깨진다(= 설치 중간에 멈춤).
;    따라서 매 호출 직후 반드시 Pop $0 한다.

!macro killConflicts
  ; 도우미 본체(업데이트 시) + 통합 전 옛 앱들(같이 깔려 충돌하던 것들)
  ; ⚠️ /T(프로세스 트리 종료) 절대 금지 — 자동업데이트 시 이 설치기가 앱이 띄운 자식이면
  ;    /T 가 트리를 타고 "방금 뜬 설치기 자신"까지 죽여 설치가 무반응으로 멈춘다(0.2.19~0.2.25 버그).
  ;    /IM 만 쓰면 같은 이름 프로세스(Electron main/renderer/gpu 전부 MegaloadDesktop.exe)는 모두 종료되고,
  ;    이름이 다른 설치기(MegaloadDesktop-Setup.exe)는 자식이어도 살아남아 설치를 끝낸다.
  nsExec::Exec 'taskkill /F /IM MegaloadDesktop.exe'
  Pop $0
  nsExec::Exec 'taskkill /F /IM CoupangThumbnailWorker.exe'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "Megaload Monitor.exe"'
  Pop $0
  Sleep 1500
!macroend

!macro customInit
  !insertmacro killConflicts
!macroend

!macro customUnInit
  !insertmacro killConflicts
!macroend
