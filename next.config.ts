import type { NextConfig } from "next";

// 배포 버전 식별 — Vercel 빌드 시 커밋 SHA/시각 주입(로컬은 'local'). 웹에서 최신 배포 확인용.
const BUILD_SHA = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);
const BUILD_TIME = new Date().toISOString();

const nextConfig: NextConfig = {
  // Dynamic local-folder reads must not bundle the development image collection into APIs.
  outputFileTracingExcludes: {
    '/*': ['./stock-image-bank/**/*'],
  },
  // 쿠팡 카테고리 실데이터(수수료·필수속성)는 런타임에 fs 로 읽는다.
  // public/ 의 파일은 CDN 으로만 올라가고 람다 번들에서 빠질 수 있어 강제로 포함시킨다.
  // 빼면 /coupang/category/* 가 프로덕션에서만 ENOENT 로 죽는다(로컬은 멀쩡해서 못 잡는다).
  // 카테고리 속성 샤드는 런타임에 fs 로 읽는다. public/ 의 파일은 CDN 으로만 올라가고
  // 람다 번들에서 빠질 수 있어 강제로 포함시킨다.
  // 빼면 /coupang/category/* 가 프로덕션에서만 ENOENT 로 죽는다(로컬은 멀쩡해서 못 잡는다).
  // 원본 11.5MB(coupang-cat-details.json)는 런타임에 쓰지 않으므로 포함시키지 않는다.
  outputFileTracingIncludes: {
    '/coupang/category/**': ['./public/data/cat-attrs/*.json'],
    // 키워드 문서는 카테고리 수수료도 같이 보여주므로 양쪽 샤드가 다 필요하다
    '/coupang/keyword/**': [
      './public/data/kw/*.json',
      './public/data/kw-index.json',
      './public/data/cat-attrs/*.json',
    ],
  },
  env: {
    NEXT_PUBLIC_BUILD_SHA: BUILD_SHA,
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
  },
  // 이미지 최적화
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2592000,
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: 'thumbnail*.coupangcdn.com' },
      { protocol: 'https', hostname: 'image*.coupangcdn.com' },
      { protocol: 'https', hostname: 'static.coupangcdn.com' },
    ],
  },
  // 실험적 최적화
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
    // 빌드 워커 수. 기본값(코어 수)이면 워커마다 프로젝트를 통째로 들고 있어서
    // 코어가 많은 개발 PC 에서 오히려 메모리로 죽는다. 그럴 때만 NEXT_BUILD_CPUS 로 줄인다.
    // 미설정이면 Next 기본 동작 그대로 — Vercel 빌드에는 영향이 없다.
    ...(process.env.NEXT_BUILD_CPUS ? { cpus: Number(process.env.NEXT_BUILD_CPUS) } : {}),
  },
  // SEO 보안 헤더 — 검색엔진 신뢰도·Core Web Vitals 보안 점수 향상
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
