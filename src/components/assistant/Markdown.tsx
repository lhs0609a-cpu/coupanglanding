'use client';

import React from 'react';

/**
 * 상담 답변용 최소 마크다운 렌더러.
 *
 * 외부 라이브러리를 넣지 않는다 — 봇 답변에 쓰이는 문법이 몇 개 안 되고,
 * 모든 페이지에 깔리는 위젯이라 번들에 파서를 추가할 이유가 없다.
 * 지원: 제목(##/###), 굵게, 인라인 코드, 목록(- / 1.), 인용(>), 표, 구분선(---).
 * HTML 은 렌더하지 않는다 (dangerouslySetInnerHTML 미사용 = XSS 여지 없음).
 */

function inline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // **굵게** 와 `코드` 만 처리
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      nodes.push(
        <strong key={`${keyBase}-b${i}`} className="font-semibold text-gray-900">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={`${keyBase}-c${i}`}
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'hr' };

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const splitRow = (l: string) =>
    l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }
    const h = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    // 표: 헤더 | 구분선 | 본문
    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        q.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', lines: q });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
        // 들여쓴 이어쓰기 줄은 앞 항목에 붙인다
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].trim();
          i++;
        }
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].trim();
          i++;
        }
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*#{1,4}\s/.test(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) blocks.push({ kind: 'p', lines: para });
  }

  return blocks;
}

export default function Markdown({ text }: { text: string }) {
  const blocks = React.useMemo(() => parse(text), [text]);

  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed text-gray-700">
      {blocks.map((b, bi) => {
        switch (b.kind) {
          case 'h':
            return (
              <div
                key={bi}
                className={
                  b.level <= 2
                    ? 'pt-1 text-[14px] font-bold text-gray-900'
                    : 'pt-0.5 text-[13.5px] font-semibold text-gray-900'
                }
              >
                {inline(b.text, `h${bi}`)}
              </div>
            );
          case 'hr':
            return <hr key={bi} className="border-gray-200" />;
          case 'ul':
            return (
              <ul key={bi} className="ml-1 space-y-1">
                {b.items.map((it, ii) => (
                  <li key={ii} className="flex gap-1.5">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                    <span>{inline(it, `u${bi}-${ii}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={bi} className="ml-1 space-y-1">
                {b.items.map((it, ii) => (
                  <li key={ii} className="flex gap-1.5">
                    <span className="mt-[1px] shrink-0 text-[12px] font-semibold text-[#E31837]">{ii + 1}.</span>
                    <span>{inline(it, `o${bi}-${ii}`)}</span>
                  </li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote
                key={bi}
                className="rounded-r border-l-[3px] border-[#E31837]/40 bg-red-50/50 py-1.5 pl-2.5 pr-2 text-[13px] text-gray-700"
              >
                {b.lines.map((l, li) => (
                  <div key={li}>{inline(l, `q${bi}-${li}`)}</div>
                ))}
              </blockquote>
            );
          case 'table':
            return (
              <div key={bi} className="-mx-1 overflow-x-auto">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr>
                      {b.headers.map((h, hi) => (
                        <th
                          key={hi}
                          className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-semibold text-gray-700"
                        >
                          {inline(h, `th${bi}-${hi}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri}>
                        {r.map((c, ci) => (
                          <td key={ci} className="border border-gray-200 px-2 py-1 align-top">
                            {inline(c, `td${bi}-${ri}-${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={bi}>
                {b.lines.map((l, li) => (
                  <React.Fragment key={li}>
                    {li > 0 && <br />}
                    {inline(l, `p${bi}-${li}`)}
                  </React.Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
