'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const platforms = [
  { name: 'Coupang', text: 'Coupang' },
  { name: 'NAVER', text: 'NAVER' },
  { name: 'kakao', text: 'kakao' },
  { name: 'toss', text: 'toss' },
];

export default function TrustedBy() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  return (
    <section className="py-16 bg-white border-y border-gray-100">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <p className="text-sm text-gray-400 mb-8 uppercase tracking-wider">
            연동 플랫폼
          </p>

          <div className="flex flex-wrap items-center justify-center gap-12 lg:gap-20">
            {platforms.map((platform, index) => (
              <motion.div
                key={platform.name}
                initial={{ opacity: 0, y: 10 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <div className="text-2xl font-bold text-gray-300 hover:text-gray-500 transition-colors">
                  {platform.text}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
