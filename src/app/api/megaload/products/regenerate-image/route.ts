import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { GoogleGenAI, Modality } from '@google/genai';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;

interface RegenerateBody {
  imageUrl: string;
  prompt?: string;
  apiKey?: string;
}

// 쿠팡 대표이미지 — 정면 각도 + 흰 배경 + 완전 복원
const DEFAULT_PROMPT = [
  'Create a clean Coupang e-commerce product thumbnail on a PURE WHITE background (#FFFFFF).',
  'Show the COMPLETE product from a STRAIGHT FRONT-FACING ANGLE (head-on view, camera perpendicular to the product) so the entire product is fully visible.',
  'Reconstruct and extend any parts that are cropped or cut off at the edges of the original so the whole product appears within the frame.',
  'Keep the product centered with balanced white space around it.',
  'PRESERVE ALL visible Korean text, labels, logos, brand names, and graphics EXACTLY — same fonts, same colors, same positions.',
  'For hidden/cropped areas, continue the packaging pattern naturally without fabricating readable text that was not clearly visible.',
  'Maintain exact product identity: same colors, same packaging design, same proportions, same material texture.',
  'Professional studio lighting, sharp focus, subtle natural shadow directly beneath the product only.',
  'NO gradient, NO colored background, NO props, NO lifestyle elements, NO tilted perspective.',
  'Square 1:1 composition, front-view e-commerce product photography.',
].join(' ');

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status}`);
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf.toString('base64'), mimeType };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' },
        { status: 404 },
      );
    }

    const body = (await req.json()) as RegenerateBody;
    const { imageUrl, prompt, apiKey: userApiKey } = body;
    if (!imageUrl) {
      return NextResponse.json({ error: '이미지 URL이 없습니다.' }, { status: 400 });
    }

    let apiKey = userApiKey;
    if (!apiKey) {
      const { data: userRow } = await serviceClient
        .from('megaload_users')
        .select('gemini_api_key')
        .eq('id', shUserId)
        .single();
      apiKey = (userRow as { gemini_api_key?: string } | null)?.gemini_api_key ?? undefined;
    }
    if (!apiKey) apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'Gemini API 키가 등록되지 않았습니다. 설정 → AI 이미지에서 본인 키를 먼저 등록해주세요.',
          code: 'NO_API_KEY',
        },
        { status: 400 },
      );
    }

    const { data: origBase64, mimeType: origMime } = await fetchImageAsBase64(imageUrl);

    const ai = new GoogleGenAI({ apiKey });
    const finalPrompt = prompt?.trim() || DEFAULT_PROMPT;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [
        { inlineData: { data: origBase64, mimeType: origMime } },
        { text: finalPrompt },
      ],
      config: { responseModalities: [Modality.IMAGE] },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find(p => p.inlineData?.data);
    const generated = imgPart?.inlineData;
    if (!generated?.data) {
      const textPart = parts.find(p => p.text)?.text;
      return NextResponse.json(
        { error: `Gemini이 이미지를 반환하지 않았습니다. ${textPart ?? ''}`.trim() },
        { status: 502 },
      );
    }

    const outMime = generated.mimeType || 'image/png';
    const outExt = outMime.includes('png') ? 'png' : outMime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(generated.data, 'base64');

    const storagePath = `megaload/${shUserId}/regenerated/${randomUUID()}.${outExt}`;
    const { error: uploadError } = await serviceClient.storage
      .from('product-images')
      .upload(storagePath, buffer, {
        contentType: outMime,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `업로드 실패: ${uploadError.message}` },
        { status: 500 },
      );
    }

    const { data: publicData } = serviceClient.storage
      .from('product-images')
      .getPublicUrl(storagePath);

    return NextResponse.json({
      url: publicData.publicUrl,
      prompt: finalPrompt,
    });
  } catch (err) {
    console.error('[regenerate-image]', err);
    void logSystemError({ source: 'megaload/products/regenerate-image', error: err }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '재생성 실패' },
      { status: 500 },
    );
  }
}
