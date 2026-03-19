'use client';

import Link from 'next/link';
import BulkRegisterPanel from '@/components/megaload/BulkRegisterPanel';

export default function BulkRegisterPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대량 상품 등록</h1>
          <p className="text-sm text-gray-500 mt-1">
            로컬 소싱 폴더에서 상품을 스캔하여 쿠팡에 대량 등록합니다.
          </p>
        </div>
        <Link href="/megaload/products" className="text-sm text-gray-500 hover:text-gray-700 transition">
          상품관리로 돌아가기
        </Link>
      </div>
      <BulkRegisterPanel />
    </div>
  );
}
