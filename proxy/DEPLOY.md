# 쿠팡 API 프록시 — Fly.io 배포 가이드

## 1. Fly.io CLI 설치

```bash
# Windows (PowerShell)
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Mac
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh
```

## 2. Fly.io 로그인

```bash
fly auth login
```

## 3. 프록시 배포

```bash
cd proxy

# 앱 생성 + 배포 (도쿄 리전)
fly launch --name coupang-proxy --region nrt --no-deploy

# 고정 IPv4 할당 ($2/월)
fly ips allocate-v4

# IP 확인 → 이 IP를 쿠팡 Wing에 등록!
fly ips list

# 시크릿 설정 (프록시 인증용)
fly secrets set PROXY_SECRET="여기에-강력한-비밀키-입력"

# 배포
fly deploy
```

## 4. 배포 확인

```bash
# 헬스체크
curl https://coupang-proxy.fly.dev/health

# 응답 예시:
# {"status":"ok","region":"nrt","timestamp":"2026-03-15T12:00:00.000Z"}
```

## 5. 쿠팡 Wing에 IP 등록

```
1. Wing 로그인 (https://wing.coupang.com)
2. [판매자정보] → [Open API] → [API Key 관리]
3. [허용 IP 등록] → fly ips list에서 나온 IPv4 입력
4. 저장
```

## 6. Vercel 환경변수 설정

```
Vercel 대시보드 → Settings → Environment Variables:

COUPANG_PROXY_URL = https://coupang-proxy.fly.dev
COUPANG_PROXY_SECRET = (위에서 설정한 것과 동일)
```

또는 `.env.local`:
```env
COUPANG_PROXY_URL=https://coupang-proxy.fly.dev
COUPANG_PROXY_SECRET=여기에-강력한-비밀키-입력
```

## 7. 연동 테스트

```bash
# 프록시 경유 쿠팡 API 호출 테스트
curl -X GET "https://coupang-proxy.fly.dev/proxy/v2/providers/seller_api/apis/api/v1/vendor/sellers/YOUR_VENDOR_ID" \
  -H "X-Proxy-Secret: 여기에-비밀키" \
  -H "X-Coupang-Access-Key: 쿠팡-액세스키" \
  -H "X-Coupang-Secret-Key: 쿠팡-시크릿키"
```

## 비용

| 항목 | 월 비용 |
|------|--------|
| Fly.io VM (shared-cpu-1x, 256MB) | 무료 |
| 고정 IPv4 | $2 |
| **합계** | **$2/월** |

## 구조

```
Vercel (메가로드)
  ↓ HTTPS + X-Proxy-Secret
Fly.io nrt (도쿄, 고정 IP)
  ↓ HMAC 서명 생성 + API 호출
쿠팡 API Gateway (한국)
```
