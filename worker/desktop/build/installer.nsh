; 메가로드 도우미 설치기 커스텀 — 설치/업데이트 시작 시 실행 중인 "충돌 프로그램"을 모두 종료.
; (앱이 켜져 있으면 파일이 잠겨 설치가 중간에 실패하는 문제 방지)
; electron-builder NSIS 가 nsis.include 로 이 파일을 !include 하고, 아래 매크로들을 호출한다.

!macro killConflicts
  ; 도우미 본체(업데이트 시) + 통합 전 옛 앱들(같이 깔려 충돌하던 것들)
  nsExec::Exec 'taskkill /F /IM MegaloadDesktop.exe /T'
  nsExec::Exec 'taskkill /F /IM CoupangThumbnailWorker.exe /T'
  nsExec::Exec 'taskkill /F /IM "Megaload Monitor.exe" /T'
  Sleep 1000
!macroend

!macro customInit
  !insertmacro killConflicts
!macroend

!macro customUnInit
  !insertmacro killConflicts
!macroend
