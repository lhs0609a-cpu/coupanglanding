import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 이미지 최적화
  images: {
    formats: ['image/avif', 'image/webp'],
    // Why: 기본값 60s 라 같은 이미지를 1분마다 재최적화 → Image Optimization 비용 폭증.
    // 30일로 늘려 동일 이미지 재최적화 회피 (비용↓ + CDN 캐시 히트로 속도↑).
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
};

export default nextConfig;
