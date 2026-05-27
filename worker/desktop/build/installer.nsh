; 메가로드 도우미 설치기 커스텀 — 설치/업데이트 시작 시 실행 중인 앱을 먼저 강제 종료.
; (앱이 켜져 있으면 파일이 잠겨 설치가 중간에 실패하는 문제 방지)
; electron-builder NSIS 가 nsis.include 로 이 파일을 !include 하고, 아래 매크로들을 호출한다.

!macro customInit
  ; 설치 시작 직후 — 실행 중인 메가로드 도우미(및 자식 프로세스) 종료
  nsExec::Exec 'taskkill /F /IM MegaloadDesktop.exe /T'
  Sleep 800
!macroend

!macro customUnInit
  ; 제거 시작 직후에도 동일하게 종료
  nsExec::Exec 'taskkill /F /IM MegaloadDesktop.exe /T'
  Sleep 800
!macroend
