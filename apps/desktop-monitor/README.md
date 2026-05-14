# Megaload Desktop Monitor

메가로드 품절동기화 데스크탑 앱 — **사용자 PC IP에서 네이버를 직접 호출**하여 서버 IP 차단을 회피.

## 왜 데스크탑 앱인가?

- Megaload Vercel/Fly.io 서버 IP는 네이버 anti-scraping에 차단됨
- 사용자 PC IP는 가정/회사 네트워크라 네이버 친화적 — 차단 거의 0%
- 100명 사용자 → 100대 PC가 분산 처리 → 비용 0원

## 폴더 구조

```
apps/desktop-monitor/
├── src/
│   ├── main/          # Electron main process (트레이/cron/auto-launch)
│   │   ├── index.ts
│   │   ├── tray.ts
│   │   ├── auto-launch.ts
│   │   └── store.ts
│   ├── preload/       # contextIsolation bridge
│   │   └── index.ts
│   └── renderer/      # 설정/상태 UI
│       ├── index.html
│       └── renderer.ts
├── build/             # 아이콘/리소스 (Phase 5)
├── package.json
├── tsconfig.json
└── electron-builder.yml
```

## Phase 진행 상황

- ✅ **Phase 1** — 프로젝트 구조 + 기본 셋업 (트레이/auto-launch/store)
- ⏳ **Phase 2** — Supabase 인증 + Vercel API endpoints
- ⏳ **Phase 3** — 백그라운드 cron + 네이버 fetch
- ⏳ **Phase 4** — 결과 전송 + 통계 UI
- ⏳ **Phase 5** — 빌드/배포 + 메가로드 웹 다운로드 페이지

## 개발 시작

```bash
cd apps/desktop-monitor
npm install
npm run dev
```

## 빌드 (Phase 5)

```bash
npm run build:win   # Windows installer (.exe)
npm run build:mac   # macOS DMG
npm run build:all   # 전체 (Windows + Mac + Linux)
```

빌드 결과물은 `release/` 에 생성. GitHub Releases로 자동 배포.

## 사용자 흐름 (완료 시)

1. 메가로드 웹 → "데스크탑 앱 다운로드" 버튼
2. installer 다운로드 (Win exe / Mac DMG)
3. 설치 → 첫 실행 시 메가로드 로그인 (1회)
4. 트레이로 자동 시작 (PC 부팅 시 자동)
5. 백그라운드에서 자기 모니터 자동 체크 → Megaload Supabase 전송
6. 사용자는 메가로드 웹에서 결과 확인
