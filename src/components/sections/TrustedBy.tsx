'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const logos = [
  { name: '쿠팡', text: 'Coupang' },
  { name: '네이버', text: 'NAVER' },
  { name: '카카오', text: 'kakao' },
  { name: '토스', text: 'toss' },
  { name: '배민', text: '배민' },
  { name: '당근', text: '당근' },
];

export default function TrustedBy() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  return (
    <section className="py-16 bg-[#030014] border-y border-white/5">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <p className="text-sm text-white/40 mb-8 uppercase tracking-wider">
            연동 플랫폼
          </p>

          <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-16">
            {logos.map((logo, index) => (
              <motion.div
                key={logo.name}
                initial={{ opacity: 0, y: 10 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="group"
              >
                <div className="text-2xl font-bold text-white/20 hover:text-white/40 transition-colors duration-300 cursor-default">
                  {logo.text}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
