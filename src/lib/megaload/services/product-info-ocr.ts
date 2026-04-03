// ============================================================
// 상품정보 이미지 OCR 서비스 (Layer 3)
//
// product_info/*.png 이미지에서 상품 스펙 테이블을 OCR로 추출.
// GPT-4o-mini Vision API 사용 (~$0.01/상품)
//
// 대상 이미지:
//  - 상품정보.png: 모델명, 브랜드, 제조사, 제품타입, 원산지 등
//  - 상품정보고시.png: 법정 고시 정보 테이블
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { getOcrCache, setOcrCache } from './ocr-cache';

/**
 * 상품 폴더의 상품정보 이미지에서 스펙을 OCR 추출한다.
 *
 * @param folderPath 상품 폴더 경로 (product_info/ 하위에 이미지 존재)
 * @returns 항목명→값 쌍 (예: { "모델명": "콘드로이친 1200 MBP", "원산지": "대한민국" })
 */
export async function extractSpecsFromProductFolder(
  folderPath: string,
): Promise<Record<string, string>> {
  // 상품정보 이미지 탐색
  const infoDir = path.join(folderPath, 'product_info');
  const candidateNames = [
    '상품정보.png', '상품정보.jpg', '상품정보.jpeg',
    '상품정보고시.png', '상품정보고시.jpg', '상품정보고시.jpeg',
    'product_info.png', 'product_info.jpg',
  ];

  const imagePaths: string[] = [];
  for (const name of candidateNames) {
    const fullPath = path.join(infoDir, name);
    if (fs.existsSync(fullPath)) {
      imagePaths.push(fullPath);
    }
  }

  if (imagePaths.length === 0) {
    return {};
  }

  // 캐시 확인
  const cached = getOcrCache(folderPath, imagePaths);
  if (cached) {
    console.log(`[product-info-ocr] 캐시 히트: ${folderPath} (${Object.keys(cached).length}개 필드)`);
    return cached;
  }

  // OCR 실행
  const specs = await extractSpecsFromImages(imagePaths);

  // 캐시 저장
  if (Object.keys(specs).length > 0) {
    setOcrCache(folderPath, imagePaths, specs);
  }

  return specs;
}

/**
 * 이미지 파일들을 GPT-4o-mini Vision API로 OCR 처리한다.
 * 여러 이미지를 한 번의 API 호출로 처리 (비용 절약).
 */
export async function extractSpecsFromImages(
  imagePaths: string[],
): Promise<Record<string, string>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[product-info-ocr] OPENAI_API_KEY 없음 → OCR 스킵');
    return {};
  }

  // 이미지를 base64로 변환
  const imageContents: { type: 'image_url'; image_url: { url: string; detail: 'low' } }[] = [];
  for (const imgPath of imagePaths) {
    try {
      const buf = fs.readFileSync(imgPath);
      const ext = path.extname(imgPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : 'image/png';
      const base64 = buf.toString('base64');
      imageContents.push({
        type: 'image_url',
        image_url: {
          url: `data:${mime};base64,${base64}`,
          detail: 'low', // 비용 절약: low detail ($0.003 vs $0.01)
        },
      });
    } catch (err) {
      console.warn(`[product-info-ocr] 이미지 읽기 실패: ${imgPath}`, err instanceof Error ? err.message : err);
    }
  }

  if (imageContents.length === 0) {
    return {};
  }

  const prompt = `이 이미지는 쇼핑몰 상품의 상품정보 테이블입니다.
테이블에서 모든 항목명과 값을 추출하여 JSON 객체로 반환하세요.

규칙:
- 항목명은 원본 그대로 사용 (예: "모델명", "브랜드", "제조사", "원산지")
- 값이 비어있거나 "-"이면 해당 항목 제외
- 여러 테이블이 있으면 모두 합쳐서 하나의 JSON으로
- 중복 항목은 첫 번째 값 사용

JSON 객체만 반환하세요.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...imageContents,
          ],
        }],
        temperature: 0,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      console.warn(`[product-info-ocr] Vision API 오류: ${res.status} ${res.statusText}`);
      return {};
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return {};

    const parsed = JSON.parse(content);

    // 유효한 항목만 필터링
    const specs: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && val.trim() !== '' && val.trim() !== '-') {
        specs[key.trim()] = val.trim();
      }
    }

    console.log(`[product-info-ocr] OCR 완료: ${Object.keys(specs).length}개 필드 추출 (이미지 ${imagePaths.length}장, 비용 ~$0.01)`);
    return specs;
  } catch (err) {
    console.warn('[product-info-ocr] OCR 실패:', err instanceof Error ? err.message : err);
    return {};
  }
}

/**
 * base64 이미지에서 직접 스펙을 추출한다.
 * (브라우저 업로드 경로용 — ocr-specs API 엔드포인트에서 사용)
 */
export async function extractSpecsFromBase64Images(
  base64Images: { data: string; mimeType: string }[],
): Promise<Record<string, string>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[product-info-ocr] OPENAI_API_KEY 없음 → OCR 스킵');
    return {};
  }

  const imageContents = base64Images.map(img => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:${img.mimeType};base64,${img.data}`,
      detail: 'low' as const,
    },
  }));

  if (imageContents.length === 0) return {};

  const prompt = `이 이미지는 쇼핑몰 상품의 상품정보 테이블입니다.
테이블에서 모든 항목명과 값을 추출하여 JSON 객체로 반환하세요.

규칙:
- 항목명은 원본 그대로 사용 (예: "모델명", "브랜드", "제조사", "원산지")
- 값이 비어있거나 "-"이면 해당 항목 제외
- 여러 테이블이 있으면 모두 합쳐서 하나의 JSON으로
- 중복 항목은 첫 번째 값 사용

JSON 객체만 반환하세요.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...imageContents,
          ],
        }],
        temperature: 0,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      console.warn(`[product-info-ocr] Vision API 오류: ${res.status}`);
      return {};
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return {};

    const parsed = JSON.parse(content);
    const specs: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && val.trim() !== '' && val.trim() !== '-') {
        specs[key.trim()] = val.trim();
      }
    }

    console.log(`[product-info-ocr] base64 OCR 완료: ${Object.keys(specs).length}개 필드`);
    return specs;
  } catch (err) {
    console.warn('[product-info-ocr] base64 OCR 실패:', err instanceof Error ? err.message : err);
    return {};
  }
}
