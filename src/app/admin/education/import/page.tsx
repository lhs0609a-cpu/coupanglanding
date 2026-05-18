'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Upload, AlertCircle, CheckCircle2, Loader2, Download, Info,
} from 'lucide-react';

interface Module {
  key: string;
  title: string;
  display_order: number;
}

type ParsedRow = { identifier: string; modules: Record<string, { status: string }> };

const STATUS_MAP: Record<string, string> = {
  // 시트 값 → DB status
  '진행전': 'triggered',
  '진행중': 'in_progress',
  '완료': 'completed',
  '검토': 'needs_review',
  '잠금': 'locked',
  // 영문도 지원
  'triggered': 'triggered',
  'in_progress': 'in_progress',
  'completed': 'completed',
  'needs_review': 'needs_review',
  'locked': 'locked',
};

export default function EducationImportPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    matched: number;
    notMatched: string[];
    updatedRows: number;
    errors: { identifier: string; error: string }[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/education/modules');
      const data = await res.json();
      if (res.ok) setModules(data.modules || []);
    })();
  }, []);

  const templateCsv = useMemo(() => {
    const headers = ['이름 또는 이메일', ...modules.map(m => m.title)].join(',');
    const example = ['홍길동', ...modules.map(() => '진행전')].join(',');
    return `${headers}\n${example}`;
  }, [modules]);

  const handleParse = () => {
    setParseError('');
    setResult(null);
    try {
      const lines = csvText.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        setParseError('헤더 + 최소 1행이 필요합니다');
        return;
      }
      const headers = lines[0].split(',').map(h => h.trim());
      const idIdx = headers.findIndex(h => h.includes('이름') || h.includes('이메일') || h.toLowerCase().includes('identifier'));
      if (idIdx < 0) {
        setParseError('첫 컬럼은 "이름 또는 이메일" 이어야 합니다');
        return;
      }

      // 헤더의 모듈명 → 모듈 key 매핑
      const moduleByTitle = new Map(modules.map(m => [m.title, m.key]));
      const moduleColumns: { colIdx: number; key: string }[] = [];
      for (let i = 0; i < headers.length; i++) {
        if (i === idIdx) continue;
        const key = moduleByTitle.get(headers[i]);
        if (key) moduleColumns.push({ colIdx: i, key });
      }

      if (moduleColumns.length === 0) {
        setParseError('매칭되는 모듈 컬럼이 없습니다. 헤더에 모듈명을 정확히 입력하세요.');
        return;
      }

      const rows: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const identifier = cols[idIdx];
        if (!identifier) continue;
        const moduleMap: Record<string, { status: string }> = {};
        for (const { colIdx, key } of moduleColumns) {
          const raw = (cols[colIdx] || '').trim();
          if (!raw) continue;
          const status = STATUS_MAP[raw];
          if (status) moduleMap[key] = { status };
        }
        rows.push({ identifier, modules: moduleMap });
      }
      setParsed(rows);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : '파싱 실패');
    }
  };

  const handleImport = async () => {
    if (parsed.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/education/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setParseError(data.error || '서버 오류');
      } else {
        setResult(data.result);
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : '실패');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link href="/admin/education" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" />
          교육 관리로 돌아가기
        </Link>
        <div className="flex items-center gap-2">
          <Upload className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">시트 데이터 일괄 import</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          기존 구글시트의 교육 현황을 CSV로 붙여넣으면 한 번에 입력됩니다.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-900 space-y-1">
            <div className="font-semibold">CSV 포맷</div>
            <div>· 첫 컬럼: <code className="bg-white px-1 rounded">이름 또는 이메일</code></div>
            <div>· 나머지 컬럼: 모듈명 (예: 사업자등록, 통신판매업 신청, 주문처리, ...)</div>
            <div>· 셀 값: <code>진행전 / 진행중 / 완료 / 검토 / 잠금</code></div>
            <div>· 빈 셀은 변경 안 함, 매칭 안 되는 학생은 skip</div>
          </div>
        </div>
        <button
          onClick={() => {
            const blob = new Blob([templateCsv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'pt_education_template.csv';
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-blue-300 text-blue-700 rounded-lg font-medium hover:bg-blue-100"
        >
          <Download className="w-3.5 h-3.5" />
          템플릿 CSV 다운로드
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">CSV 데이터</label>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={10}
          placeholder="이름,사업자등록,통신판매업 신청,...&#10;홍길동,완료,완료,진행중,..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none"
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleParse}
            disabled={!csvText.trim()}
            className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-medium disabled:opacity-50"
          >
            파싱 (미리보기)
          </button>
          {parsed.length > 0 && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 text-sm bg-[#E31837] hover:bg-[#c01530] text-white rounded-lg font-medium disabled:opacity-50 inline-flex items-center gap-2"
            >
              {importing && <Loader2 className="w-4 h-4 animate-spin" />}
              {parsed.length}건 import 실행
            </button>
          )}
        </div>
      </div>

      {parseError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {parseError}
        </div>
      )}

      {parsed.length > 0 && !result && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b font-semibold text-sm">
            파싱 결과 — {parsed.length}건 (실행 전 미리보기)
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">학생</th>
                <th className="text-left px-4 py-2">매핑된 모듈 수</th>
              </tr>
            </thead>
            <tbody>
              {parsed.slice(0, 20).map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{r.identifier}</td>
                  <td className="px-4 py-2 text-gray-500">{Object.keys(r.modules).length}개</td>
                </tr>
              ))}
              {parsed.length > 20 && (
                <tr><td colSpan={2} className="px-4 py-2 text-center text-xs text-gray-400">
                  ... 외 {parsed.length - 20}건
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div className="font-semibold text-green-900">Import 완료</div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-white rounded p-3">
              <div className="text-xs text-gray-500">학생 매칭</div>
              <div className="text-2xl font-bold text-green-700">{result.matched}</div>
            </div>
            <div className="bg-white rounded p-3">
              <div className="text-xs text-gray-500">갱신된 모듈</div>
              <div className="text-2xl font-bold text-blue-700">{result.updatedRows}</div>
            </div>
            <div className="bg-white rounded p-3">
              <div className="text-xs text-gray-500">매칭 실패</div>
              <div className="text-2xl font-bold text-red-700">{result.notMatched.length}</div>
            </div>
          </div>
          {result.notMatched.length > 0 && (
            <div className="mt-3 text-xs text-gray-600">
              <div className="font-semibold mb-1">매칭 실패한 학생 (이름/이메일을 확인하세요):</div>
              <div className="bg-white rounded p-2">{result.notMatched.join(', ')}</div>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="mt-3 text-xs text-red-700">
              <div className="font-semibold mb-1">에러 ({result.errors.length}건):</div>
              <ul className="bg-white rounded p-2 space-y-0.5">
                {result.errors.map((e, i) => (
                  <li key={i}>{e.identifier}: {e.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
