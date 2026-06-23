import type { NextConfig } from "next";

// 배포 버전 식별 — Vercel 빌드 시 커밋 SHA/시각 주입(로컬은 'local'). 웹에서 최신 배포 확인용.
const BUILD_SHA = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);
const BUILD_TIME = new Date().toISOString();

const nextConfig: NextConfig = {
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
