/**
 * 계약서 PDF 다운로드 유틸리티
 * 브라우저 Print API 기반 (외부 라이브러리 없음)
 */

import type { Contract, PtUser, Profile } from '@/lib/supabase/types';
import { renderArticleText, getContractArticles } from '@/lib/data/contract-terms';

interface ContractPdfParams {
  contract: Contract;
  ptUser: PtUser & { profile?: Profile };
}

export function downloadContractPdf({ contract, ptUser }: ContractPdfParams) {
  const contractMode = (contract.contract_mode || 'single') as 'single' | 'triple';
  const articles = getContractArticles(contractMode);

  const vars = {
    share_percentage: contract.share_percentage,
    start_date: contract.start_date,
    end_date: contract.end_date,
    contract_mode: contractMode,
    operator_name: ptUser.profile?.full_name || '(실운영자)',
    business_rep_name: contract.business_signer_name || ptUser.business_representative || '(사업자 대표)',
  };

  const userName = ptUser.profile?.full_name || '이름 없음';
  const signedDate = contract.signed_at
    ? new Date(contract.signed_at).toLocaleDateString('ko-KR')
    : '';
  const businessSignedDate = contract.business_signed_at
    ? new Date(contract.business_signed_at).toLocaleDateString('ko-KR')
    : '';

  const articlesHtml = articles.map((article) => {
    const paragraphsHtml = article.paragraphs
      .map((p) => `<p>${renderArticleText(p, vars)}</p>`)
      .join('');
    const subItemsHtml = article.subItems
      ? `<ul style="padding-left:20px; margin-top:5px; list-style:disc;">${article.subItems.map((sub) => {
          const subText = renderArticleText(sub.text, vars);
          const labelPrefix = sub.label !== String(article.subItems!.indexOf(sub) + 1)
            ? `<strong>${sub.label}:</strong> `
            : '';
          return `<li style="margin-bottom:3px;">${labelPrefix}${subText}</li>`;
        }).join('')}</ul>`
      : '';

    return `
      <div class="article">
        <div class="article-title">제${article.number}조 (${article.title})</div>
        <div class="article-content">
          ${paragraphsHtml}
          ${subItemsHtml}
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8" />
      <title>계약서 - ${userName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; font-size: 13px; line-height: 1.8; color: #333; }
        h1 { text-align: center; font-size: 22px; margin-bottom: 30px; }
        .info-box { border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
        .info-row { display: flex; margin-bottom: 5px; }
        .info-label { width: 120px; font-weight: bold; color: #666; }
        .info-value { flex: 1; }
        .article { margin-bottom: 18px; }
        .article-title { font-weight: bold; font-size: 14px; margin-bottom: 5px; }
        .article-content { padding-left: 10px; }
        .signature-section { margin-top: 40px; border-top: 2px solid #E31837; padding-top: 20px; }
        .sig-row { display: flex; justify-content: space-between; margin-top: 20px; }
        .sig-box { width: 45%; text-align: center; }
        .sig-box p { margin-bottom: 8px; }
        .sig-img { max-width: 200px; max-height: 80px; }
        @media print {
          body { padding: 20px; }
          @page { margin: 20mm; }
        }
      </style>
    </head>
    <body>
      <h1>쿠팡 셀러 PT 파트너십 ${contractMode === 'triple' ? '3자 ' : ''}계약서</h1>

      <div class="info-box">
        <div class="info-row"><span class="info-label">계약자:</span><span class="info-value">${userName}</span></div>
        <div class="info-row"><span class="info-label">수수료율:</span><span class="info-value">${contract.share_percentage}%</span></div>
        <div class="info-row"><span class="info-label">계약 시작일:</span><span class="info-value">${contract.start_date}</span></div>
        <div class="info-row"><span class="info-label">계약 종료일:</span><span class="info-value">${contract.end_date || '무기한'}</span></div>
        <div class="info-row"><span class="info-label">계약 상태:</span><span class="info-value">${contract.status === 'signed' ? '서명 완료' : contract.status}</span></div>
        ${signedDate ? `<div class="info-row"><span class="info-label">서명일:</span><span class="info-value">${signedDate}</span></div>` : ''}
      </div>

      ${articlesHtml}

      <div class="signature-section">
        <p style="text-align: center; font-weight: bold; font-size: 15px; margin-bottom: 15px;">
          위 계약 내용에 동의하며 서명합니다.
        </p>
        ${contractMode === 'triple' ? `
        <div style="display: flex; justify-content: space-between; margin-top: 20px; gap: 10px;">
          <div class="sig-box" style="width: 30%;">
            <p><strong>갑 (회사)</strong></p>
            <p>메가로드</p>
          </div>
          <div class="sig-box" style="width: 30%;">
            <p><strong>을 (사업자)</strong></p>
            <p>${contract.business_signer_name || ptUser.business_representative || '(사업자 대표)'}</p>
            ${contract.business_signature_data
              ? '<img src="' + contract.business_signature_data + '" alt="사업자 서명" class="sig-img" />'
              : '<p style="color: #999;">(미서명)</p>'
            }
            ${businessSignedDate ? '<p style="font-size: 11px; color: #888;">' + businessSignedDate + '</p>' : ''}
          </div>
          <div class="sig-box" style="width: 30%;">
            <p><strong>병 (운영자)</strong></p>
            <p>${userName}</p>
            ${contract.signature_data
              ? '<img src="' + contract.signature_data + '" alt="운영자 서명" class="sig-img" />'
              : '<p style="color: #999;">(미서명)</p>'
            }
            ${signedDate ? '<p style="font-size: 11px; color: #888;">' + signedDate + '</p>' : ''}
          </div>
        </div>
        ` : `
        <div class="sig-row">
          <div class="sig-box">
            <p><strong>갑 (서비스 제공자)</strong></p>
            <p>메가로드</p>
          </div>
          <div class="sig-box">
            <p><strong>을 (PT 사용자)</strong></p>
            <p>${userName}</p>
            ${contract.signature_data
              ? '<img src="' + contract.signature_data + '" alt="서명" class="sig-img" />'
              : '<p style="color: #999;">(미서명)</p>'
            }
            ${signedDate ? '<p style="font-size: 11px; color: #888;">' + signedDate + '</p>' : ''}
          </div>
        </div>
        `}
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();

  setTimeout(() => {
    printWindow.print();
  }, 500);
}
