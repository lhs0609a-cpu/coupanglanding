'use client';

import Link from 'next/link';
import AllInOneRegisterPanel from '@/components/megaload/AllInOneRegisterPanel';
import WorkerInstallNotice from '@/components/megaload/WorkerInstallNotice';

export default function AllInOneRegisterPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">올인원 자동등록</h1>
          <p className="text-sm text-gray-500 mt-1">
            로컬 워커가 생성한 노출명·카테고리·가격·옵션·상세·대표이미지를 불러와 검수 후 쿠팡에 등록합니다.
          </p>
        </div>
        <Link href="/megaload/products" className="text-sm text-gray-500 hover:text-gray-700 transition">
          상품관리로 돌아가기
        </Link>
      </div>
      <WorkerInstallNotice context="allinone" />
      <AllInOneRegisterPanel />
    </div>
  );
}
