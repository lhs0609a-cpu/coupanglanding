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

### 생성 자원 조절 (v0.6.14)

- 생성 직전 CPU 코어 수, 감지된 GPU와 남은 VRAM, 시스템 RAM을 읽는다. 자체 이미지 엔진은 측정 전에 내려 측정값을 왜곡하지 않는다.
- 공통 정책은 `worker/lib/generation-resources.mjs`이다. VRAM 8GB와 RAM 여유 5GB 이상일 때 큰 모델을 허용한다. 나머지는 작은 모델과 상품 1개씩 처리한다. 측정이 불확실해도 보수적인 설정을 쓴다.
- 동시 상품 수는 CPU·RAM·VRAM 조건에 따라 1~3개이며 이미지 인식은 1개이다. 두 모델 동시 상주는 VRAM 16GB와 RAM 여유 10GB 이상일 때만 허용한다. 엔진이 재기동되면 서버 슬롯도 1개로 낮춘다.
- 각 상품 시작 전에 시스템 메모리를 다시 확인한다. 여유가 4GB 아래로 떨어지거나 연결·메모리 오류가 발생하면 남은 작업은 순차 처리한다. 실패한 상품만 별도 재시도하며, 영구적인 복구 실패는 상한을 두고 알린다.
- CPU 처리의 생성 요청은 최대 20분, GPU 처리는 10분 기다린다. 엔진 복귀 대기는 각각 10분·5분이다. 타임아웃을 무한히 늘리거나 결과 품질 기준을 낮추지 않는다.
- 실행 폴더의 `_generation-resources.json`에 측정값·선택 설정을 기록한다. `*.text-checkpoint.jsonl`은 상품별 텍스트 결과를 즉시 저장하며, 같은 입력과 설정으로 재실행하면 재사용한다. 이미지 처리 단계는 다시 실행될 수 있다.
- 하드웨어 고장, 지원되지 않는 실행 환경, 모델 적재에 필요한 최소 메모리 부족까지 모든 PC의 성공을 보장하지 않는다. 부족한 자원은 실행 전에 설명하고 결과를 보존한다.

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

## 빌드 (원샷 — 권장)

```powershell
# worker/desktop 에서 우클릭 → "PowerShell로 실행", 또는:
powershell -ExecutionPolicy Bypass -File build-installer.ps1
```

`build-installer.ps1` 한 번이면: **로컬 복사(Drive FS 회피) → npm 설치 → winCodeSign 심링크 우회 →
설치기 빌드**까지 끝나고, `.exe` 경로를 알려줍니다. 관리자 권한·개발자 모드 불필요.

> ⚠️ Google Drive("내 드라이브") 폴더에서 `npm run dist` 를 **직접** 돌리면 파일잠금/심링크
> 문제로 실패합니다. 반드시 위 스크립트(로컬 빌드)를 쓰세요.

## 개발 실행 / 수동 빌드

```bash
cd worker/desktop
npm install
npm start          # 개발 실행 (앱 바로 뜸)
npm run dist       # 수동 빌드 (단, Drive 폴더에선 실패 — build-installer.ps1 사용 권장)
```

> 아이콘을 넣으려면 `desktop/build/icon.ico` 를 추가하세요(없어도 빌드됨).
> 빌드 산출물 `.exe` 는 `dist/` 에 생성됩니다(git 미포함 — GitHub Releases 에 업로드).

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
