import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;


// 인메모리 레이트 리미팅
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= 5) {
    return false;
  }

  entry.count++;
  return true;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const masked = local[0] + '*'.repeat(Math.max(local.length - 1, 1));
  return `${masked}@${domain}`;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      );
    }

    const { name, phone } = await request.json();

    if (!name || !phone) {
      return NextResponse.json(
        { error: '이름과 연락처를 모두 입력해주세요.' },
        { status: 400 }
      );
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');

    const supabase = await createServiceClient();

    const { data } = await supabase
      .from('profiles')
      .select('email')
      .eq('full_name', name.trim())
      .eq('phone', cleanPhone)
      .limit(1)
      .single();

    if (!data) {
      return NextResponse.json(
        { error: '일치하는 계정을 찾을 수 없습니다. 입력 정보를 확인해주세요.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ maskedEmail: maskEmail(data.email) });
  } catch {
    return NextResponse.json(
      { error: '일치하는 계정을 찾을 수 없습니다. 입력 정보를 확인해주세요.' },
      { status: 404 }
    );
  }
}
