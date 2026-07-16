'use client';

import Link from 'next/link';
import AllInOneRegisterPanel from '@/components/megaload/AllInOneRegisterPanel';
import WorkerInstallNotice from '@/components/megaload/WorkerInstallNotice';
import ComfyStatusBadge from '@/components/megaload/ComfyStatusBadge';

export default function AllInOneRegisterPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">올인원 등록 (폴더)</h1>
          <p className="text-sm text-gray-500 mt-1">
            로컬 워커(올인원 생성)가 폴더에 만들어둔 노출명·카테고리·가격·옵션·상세·대표이미지를 불러와 검수 후 쿠팡에 등록합니다.
            <br className="hidden sm:block" />※ 대량등록 화면의 <b>무인 자동등록</b>과는 다릅니다(그건 일반 소싱 폴더를 서버가 생성·무인등록).
          </p>
        </div>
        <Link href="/megaload/products" className="text-sm text-gray-500 hover:text-gray-700 transition">
          상품관리로 돌아가기
        </Link>
      </div>
      <div className="space-y-2">
        <WorkerInstallNotice context="allinone" />
        {/* 누끼 엔진(ComfyUI) 라이브니스 — 도우미 연결 배너와 함께 상단 노출 */}
        <ComfyStatusBadge />
      </div>
      <AllInOneRegisterPanel />
    </div>
  );
}
