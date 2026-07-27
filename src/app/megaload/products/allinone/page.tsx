'use client';

import Link from 'next/link';
import AllInOneRegisterPanel from '@/components/megaload/AllInOneRegisterPanel';
import WorkerInstallNotice from '@/components/megaload/WorkerInstallNotice';
import ComfyStatusBadge from '@/components/megaload/ComfyStatusBadge';
import VisionStatusBadge from '@/components/megaload/VisionStatusBadge';

export default function AllInOneRegisterPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">올인원 등록 (폴더)</h1>
          <p className="text-sm text-gray-500 mt-1">
            데스크탑 <b>메가로드 도우미 → ⚙️ 올인원 생성</b>이 폴더에 만들어둔 노출명·카테고리·가격·옵션·상세·대표이미지를 불러와 검수 후 쿠팡에 등록합니다.
            <br className="hidden sm:block" />※ 대량등록 화면의 <b>무인 자동등록</b>과는 다릅니다(그건 일반 소싱 폴더를 서버가 생성·무인등록).
          </p>
        </div>
        <Link href="/megaload/products" className="text-sm text-gray-500 hover:text-gray-700 transition">
          상품관리로 돌아가기
        </Link>
      </div>
      <div className="space-y-2">
        <WorkerInstallNotice context="allinone" />
        {/* 엔진 라이브니스 신호등 — 누끼(ComfyUI)·비전(qwen2.5vl)이 실제 가동/준비됐는지 표시 */}
        <div className="flex flex-wrap items-center gap-2">
          <ComfyStatusBadge />
          <VisionStatusBadge />
        </div>
      </div>
      <AllInOneRegisterPanel />
    </div>
  );
}
