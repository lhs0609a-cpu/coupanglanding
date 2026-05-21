# 쿠팡 썸네일 워커 — 데스크톱 앱 (Electron)

GPU 있는 사용자가 **설치 .exe 더블클릭 → 실행**만 하면, ComfyUI/SDXL 모델까지
앱이 자동으로 받아 설치하고, 클라우드의 "전체 썸네일 재생성" 잡을 끌어와 처리하는
트레이 상주 앱입니다. service_role 키 불필요, 인바운드 포트/터널 불필요.

## 사용자 경험 (설치 후)
1. 앱 실행 → **1. 엔진 설치**: GPU 점검 후 "엔진 설치" → ComfyUI 포터블 + SDXL
   모델(~6.5GB) 자동 다운로드/설치 (진행률 표시)
2. **2. 로그인**: Supabase URL / anon 키 / megaload 계정으로 로그인
3. **3. 실행**: "워커 시작" → 백그라운드로 잡을 처리. 창을 닫아도 트레이에 상주.

웹 megaload에서 "전체 썸네일 재생성"을 누르면 잡이 큐에 쌓이고, 실행 중인 워커가
자동으로 비웁니다. 여러 PC에 설치하면 잡이 자동 분산됩니다(SKIP LOCKED).

---

## 구조

```
desktop/
├── main/                  # Electron 메인 프로세스 (ESM)
│   ├── main.mjs           # 앱/트레이/창/IPC
│   ├── preload.mjs        # contextBridge API
│   ├── store.mjs          # userData/settings.json 영속
│   ├── bootstrap.mjs      # ComfyUI/모델 자동 설치 (7zip-bin 동봉)
│   ├── comfy-manager.mjs  # ComfyUI 프로세스 실행/헬스/종료
│   └── worker-runner.mjs  # 로그인 + 풀 루프 시작/정지
├── renderer/              # UI (index.html / app.js / style.css)
├── runtime/               # ★빌드 산출물 — sync-runtime.mjs 가 ../lib 에서 복사
├── sync-runtime.mjs       # 공유 라이브러리 동기화
├── package.json
└── electron-builder.yml   # NSIS 원클릭 설치기 설정
```

`runtime/` 은 상위 `worker/lib/*.mjs`(comfyui-client / supabase-rest / pull-loop)와
예제 워크플로의 복사본입니다. CLI 워커와 **동일한 코어 로직을 공유**합니다.

---

## 개발 / 빌드

```bash
cd worker/desktop
npm install
npm start          # = sync-runtime + electron .  (개발 실행)
npm run dist       # = sync-runtime + electron-builder  → dist/ 에 설치 .exe 생성
```

> 아이콘을 넣으려면 `desktop/build/icon.ico` 를 추가하세요(없어도 빌드됨).

### 다운로드 URL (환경 따라 조정 필요)
`main/bootstrap.mjs` 의 `DEFAULTS`:
- `comfyArchiveUrl`: ComfyUI 공식 Windows 포터블 7z. **릴리스마다 자산명이 바뀔 수
  있으니** 최신 릴리스의 실제 `.7z` 링크로 맞춰주세요(앱의 설정에서 override 가능하게
  `store` 키 `comfyArchiveUrl` 로 노출돼 있습니다).
- `modelUrl`: SDXL base (HuggingFace 공개). Juggernaut XL 등으로 바꾸려면 URL 교체.

---

## ⚠️ 검증 상태 (정직하게)

이 앱의 **소스는 완성**됐고 각 모듈 문법/임포트는 확인했지만, 아래는 실제 Windows +
GPU + electron-builder 환경에서 **반드시 1회 검증이 필요**합니다(이 작업 환경엔 GPU도
ComfyUI도 없어 미실행):

- ComfyUI 포터블 다운로드 URL의 현재 유효성 / 7z 해제
- 임베디드 파이썬 경로(`python_embeded/python.exe`)와 실행 인자
- `npm run dist` 패키징 (asar:false, 7zip-bin unpack, ESM 메인)
- Electron 버전과 ESM 메인/`.mjs` preload 호환

첫 통합 테스트 시 위 순서로 점검하세요. 막히는 지점이 있으면 그 로그를 알려주시면
바로 잡겠습니다.
