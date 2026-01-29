import Header from '@/components/sections/Header';
import Hero from '@/components/sections/Hero';
import TrustedBy from '@/components/sections/TrustedBy';
import SocialProof from '@/components/sections/SocialProof';
import Features from '@/components/sections/Features';
import AIFeatures from '@/components/sections/AIFeatures';
import Automation from '@/components/sections/Automation';
import Pricing from '@/components/sections/Pricing';
import Testimonials from '@/components/sections/Testimonials';
import FAQ from '@/components/sections/FAQ';
import CTA from '@/components/sections/CTA';
import Footer from '@/components/sections/Footer';

export default function ProgramPage() {
  return (
    <main className="min-h-screen bg-[#030014]">
      {/* 1. Header - 네비게이션 */}
      <Header showBackButton />

      {/* 2. Hero - Problem + Solution 티저 (3초 룰) */}
      <Hero />

      {/* 3. TrustedBy - 빠른 신뢰 구축 */}
      <TrustedBy />

      {/* 4. SocialProof - 의심 제거 + AI 데모 */}
      <SocialProof />

      {/* 5. Features - 비교표 포함, 이렇게 가능합니다 */}
      <Features />

      {/* 6. AIFeatures - AI 기능 상세 */}
      <AIFeatures />

      {/* 7. Automation - 자동화 파이프라인 */}
      <Automation />

      {/* 8. Testimonials - 실제 결과 (Before/After) */}
      <Testimonials />

      {/* 9. Pricing - ROI 앵커링 적용 */}
      <Pricing />

      {/* 10. FAQ - 마지막 의심 제거 */}
      <FAQ />

      {/* 11. CTA - 긴급성 + FOMO + 보장 */}
      <CTA />

      {/* 12. Footer */}
      <Footer />
    </main>
  );
}
