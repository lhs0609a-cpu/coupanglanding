# 쿠팡 썸네일 일괄 재생성 워커 (로컬 GPU / ComfyUI SDXL)

네이버 누끼 PNG를 **본인 GPU의 ComfyUI(SDXL)**로 쿠팡 규격 썸네일로 일괄 재생성합니다.
서버 비용 0원, 외부 API 호출 0회. 의존성 0 (Node.js 18+ 내장 기능만 사용).

> **핵심 원리**: **배경 있는 일반 상품 사진이어도 자동으로 누끼**됩니다. 워크플로의
> 세그멘테이션 노드(InspyrenetRembg)가 사진에서 상품 마스크를 만들고, 그 **배경영역만
> 새로 생성**하며 상품 픽셀은 그대로 보존합니다(SDXL 인페인트). 쿠팡 대표이미지는
> "실제 상품과 동일"해야 하므로, 상품을 통째로 새로 그리는 방식(IP-Adapter 등)은
> 정책·오인 위험이 있어 기본 워크플로는 **상품 보존형 인페인트**입니다.
>
> ⚠️ **필요 커스텀 노드**: `ComfyUI-Inspyrenet-Rembg` (ComfyUI-Manager 에서 'Inspyrenet'
> 검색 후 설치, 첫 실행 시 모델 자동 다운로드). 미설치 시 워커가 "노드 미설치"로 안내하고
> 원본 사진으로 폴백합니다. 다른 RMBG 노드를 쓰려면 워크플로 9번 노드의 `class_type` 과
> MASK 출력 인덱스만 맞추면 됩니다.

---

## 0. 미리 보기 (GPU/ComfyUI 없이)

어떤 상품·이미지가 대상이 되는지부터 확인하세요:

```bash
node regenerate-thumbnails.mjs --root "C:\배치폴더" --dry-run
```

`product_*/main_images/` 의 **정렬상 첫 장**(= 쿠팡 대표 썸네일)만 잡힙니다.
광고/배지 파일명(`banner`, `logo`, `npay` 등)은 자동 제외됩니다.

---

## 1. ComfyUI 설치 (NVIDIA GPU 기준)

```bash
git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
pip install -r requirements.txt
python main.py            # → http://127.0.0.1:8188 에서 실행
```

AMD는 ROCm 빌드, Mac은 자동으로 MPS 백엔드를 씁니다.

### 모델 다운로드 (무료)

`ComfyUI/models/checkpoints/` 에 SDXL 체크포인트 1개를 넣습니다:

| 모델 | 특징 | 다운로드 |
|---|---|---|
| **Juggernaut XL** | 제품/광고 사진 특화 (추천) | Hugging Face / Civitai |
| RealVisXL | 포토리얼리스틱 | Hugging Face / Civitai |
| sd_xl_base_1.0 | 순정 SDXL | Hugging Face |

> 약 6.5GB. 예제 워크플로는 `sd_xl_base_1.0.safetensors`로 설정돼 있으니,
> 다른 모델을 쓰면 `workflows/...json`의 `ckpt_name`을 그 파일명으로 바꾸세요.

---

## 2. 워크플로 준비 (둘 중 하나)

**(A) 예제 그대로 쓰기** — `workflows/sdxl-inpaint-thumbnail.example.json`.
`ckpt_name`만 본인 체크포인트 파일명으로 수정하면 바로 동작합니다.

**(B) 직접 만들기 (권장, 품질↑)** — ComfyUI UI에서 인페인트 워크플로를 구성하고
저장합니다:
1. 설정(⚙️) → **Enable Dev mode Options** 체크
2. 메뉴에서 **Save (API Format)** 클릭 → `workflows/my-workflow.json` 으로 저장
3. 실행 시 `--workflow workflows/my-workflow.json`

> 워커는 그래프 안의 `LoadImage`와 `KSampler`를 **자동 인식**해 입력 이미지·프롬프트·
> 시드를 주입합니다. 그래서 워크플로가 어떤 구조든(인페인트/img2img/IP-Adapter) 동작합니다.
> 자동 인식이 빗나가면 `config.json`의 `nodeIds`에 노드 ID를 직접 지정하세요.

---

## 3. 단일 이미지로 먼저 검증 (중요)

전체를 돌리기 전에 **반드시 한 장으로 결과를 눈으로 확인**하세요:

```bash
node regenerate-thumbnails.mjs --test "C:\배치폴더\product_001\main_images\01.png"
```

→ 같은 폴더에 `01.regen.png` 가 생깁니다. 원본과 비교해서 상품이 보존됐는지,
배경이 깔끔한 흰색인지 확인하고 프롬프트/모델을 조정하세요.

---

## 4. 일괄 실행

```bash
# 비파괴 모드(기본): main_images_regen/ 에 결과만 생성 — 원본 안 건드림
node regenerate-thumbnails.mjs --root "C:\배치폴더"

# 결과 확인 후, 실제로 main_images/ 교체 (원본은 main_images_original/ 로 자동 백업)
node regenerate-thumbnails.mjs --root "C:\배치폴더" --write inplace
```

`--write inplace` 로 교체하면, 기존 **브라우저 대량등록 툴**이 다음 폴더 스캔 때
새 썸네일을 그대로 읽어갑니다(코드 변경 불필요).

### 옵션

| 옵션 | 설명 |
|---|---|
| `--root <경로>` | 배치 루트 (`product_*` 들을 포함) |
| `--comfy <url>` | ComfyUI 주소 (기본 `http://127.0.0.1:8188`) |
| `--workflow <경로>` | API-format 워크플로 JSON |
| `--write sibling\|inplace` | 비파괴(기본) / 원본 백업 후 교체 |
| `--all-main` | 대표후보 전체 재생성 (기본: 대표 첫 장만) |
| `--limit <N>` | 앞 N개 상품만 (테스트) |
| `--test <이미지>` | 단일 이미지 검증 → `*.regen.png` |
| `--force` | 이미 생성된 결과도 다시 (기본: resume) |
| `--timeout <초>` | 장당 타임아웃 (기본 300) |
| `--dry-run` | 대상만 출력 (생성 안 함, ComfyUI 불필요) |

CLI 인자 대신 `config.json`(= `config.example.json` 복사)에 기본값과 프롬프트를
지정할 수도 있습니다. **CLI 인자가 항상 우선**합니다.

---

## 5. 동작 방식 / 성능

```
누끼 PNG → /upload/image → 워크플로 패치(이미지·프롬프트·시드) → /prompt 큐잉
        → /history 폴링(완료 대기) → /view 다운로드 → 폴더에 저장
```

- GPU는 **직렬 처리**(동시성 1)라 VRAM 초과 없이 안정적입니다.
- 중단되면 다시 실행만 하면 됩니다 — 이미 만든 건 자동으로 건너뜁니다(resume).
- 진행 상황은 배치 루트의 `thumbnail-regen-<타임스탬프>.ndjson` 에 한 줄씩 기록됩니다.

| GPU | 1장(SDXL 25steps) |
|---|---|
| RTX 3060 | ~15초 |
| RTX 3080 / 4070 | ~6초 |
| RTX 4090 | ~3초 |

---

## ⚠️ 주의

- **결과는 원본과 반드시 비교 확인하세요.** SDXL이 배경/그림자를 생성하므로,
  상품 외곽(특히 반투명·머리카락·유리)에서 어색함이 생길 수 있습니다.
- 글자/로고가 상품 위에 있는 경우 인페인트 마스크가 정확해야 보존됩니다
  (누끼가 깔끔할수록 결과가 좋습니다).
- 첫 실행 시 SDXL 모델 로딩으로 1~2분 걸릴 수 있습니다(이후 캐시).

---

# 클라우드 모드 (설치형 풀 워커)

로컬 폴더 대신, **웹에서 "전체 썸네일 재생성"으로 만든 잡**을 끌어와 처리하는 모드.
GPU 있는 사람이 워커를 설치/실행만 하면, 클라우드의 pending 잡을 자동으로 비웁니다.
인바운드 포트/터널 불필요(워커가 클라이언트로서 폴링), service_role 키 불필요.

```
[웹 megaload]  "전체 썸네일 재생성" 클릭
   → POST /api/megaload/products/thumbnail-jobs/enqueue  → pending 잡 N건
[로컬 워커]  cloud-worker.mjs ── 사용자 로그인 → claim(RPC) → ComfyUI 생성
   → Storage 업로드 → 잡 done(result_url)
[웹]  GET /api/megaload/products/thumbnail-jobs?batchId=...  로 진행률 표시
```

### 사전 준비 (서버 1회)

Supabase 대시보드 > SQL Editor 에서 마이그레이션 실행:
`supabase/migration_thumbnail_jobs.sql` (잡 테이블 + RLS + claim RPC)

### 워커 설정

`config.json` 의 `cloud` 블록을 채웁니다 (`config.example.json` 참고):

| 키 | 값 |
|---|---|
| `supabaseUrl` | `NEXT_PUBLIC_SUPABASE_URL` 값 |
| `anonKey` | **`NEXT_PUBLIC_SUPABASE_ANON_KEY`(공개키)** — ⚠️ service_role 키 절대 금지 |
| `email` / `password` | megaload 로그인 계정 (비번은 환경변수 `WORKER_PASSWORD` 권장) |

> 워커는 사용자 JWT로만 접근하고 RLS가 **본인 잡만** 보이게 강제합니다.
> 첫 로그인 후 토큰은 `worker/.session.json` 에 캐시됩니다(자동 갱신).

### 실행

```bash
node cloud-worker.mjs            # 무한 폴링 (pending 생기면 자동 처리)
node cloud-worker.mjs --once     # pending 다 비우면 종료
node cloud-worker.mjs --max 50   # 50건 처리 후 종료
```

여러 GPU가 있으면 머신마다 워커를 띄우면 됩니다 — `claim`이 `FOR UPDATE SKIP LOCKED`
라 잡이 자동 분산되고 중복 처리되지 않습니다.

### 웹 연동 (남은 작업)

서버 라우트(enqueue/status)는 추가됨. 아직 **버튼 UI는 미연결**입니다 —
`BulkStep2Review` 등에서 대표이미지 URL 목록을 모아 enqueue를 호출하고,
batchId로 진행률을 폴링해 표시하는 부분이 다음 단계입니다.

> ⚠️ enqueue의 `sourceUrl`은 워커가 다운로드 가능한 URL이어야 합니다(이미 Supabase에
> 업로드된 누끼 또는 원격 URL). 브라우저 로컬 파일(blob:)은 먼저 업로드가 필요합니다.

### .gitignore 권장

`worker/.session.json`, `worker/config.json` 은 자격증명이 들어가므로 커밋하지 마세요.

### 설치형 데스크톱 앱 (원클릭)

위 `cloud-worker.mjs` 를 일반 사용자가 쓰기 쉽게 Electron 트레이 앱으로 패키징한
버전이 **`worker/desktop/`** 에 있습니다. 설치 .exe 더블클릭 → ComfyUI/모델 자동 설치
→ 로그인 → 시작. 코어 로직(`lib/*.mjs`)을 그대로 공유합니다. 빌드/검증 안내는
`worker/desktop/README.md` 참고.
