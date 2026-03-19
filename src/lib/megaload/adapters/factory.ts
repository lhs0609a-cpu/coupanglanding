/**
 * 채널 어댑터 팩토리 — credentials로 인증된 어댑터 인스턴스 반환
 */
import type { Channel } from '../types';
import { BaseAdapter } from './base.adapter';
import { CoupangAdapter } from './coupang.adapter';
import { NaverAdapter } from './naver.adapter';
import { ElevenstAdapter } from './elevenst.adapter';
import { EsmAdapter } from './esm.adapter';
import { LotteonAdapter } from './lotteon.adapter';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createAdapter(channel: Channel): BaseAdapter {
  switch (channel) {
    case 'coupang':
      return new CoupangAdapter();
    case 'naver':
      return new NaverAdapter();
    case 'elevenst':
      return new ElevenstAdapter();
    case 'gmarket':
      return new EsmAdapter('gmarket');
    case 'auction':
      return new EsmAdapter('auction');
    case 'lotteon':
      return new LotteonAdapter();
    default:
      throw new Error(`지원하지 않는 채널: ${channel}`);
  }
}

/**
 * DB에서 채널 자격증명 가져와서 인증된 어댑터 반환
 */
export async function getAuthenticatedAdapter(
  supabase: SupabaseClient,
  megaloadUserId: string,
  channel: Channel
): Promise<BaseAdapter> {
  const { data: cred } = await supabase
    .from('channel_credentials')
    .select('credentials')
    .eq('megaload_user_id', megaloadUserId)
    .eq('channel', channel)
    .eq('is_connected', true)
    .single();

  if (!cred) {
    throw new Error(`${channel} 채널이 연결되지 않았습니다.`);
  }

  const adapter = createAdapter(channel);
  await adapter.authenticate(cred.credentials as Record<string, unknown>);
  return adapter;
}

/**
 * 해당 셀러의 모든 연결된 채널 어댑터 반환
 */
export async function getAllAuthenticatedAdapters(
  supabase: SupabaseClient,
  megaloadUserId: string
): Promise<{ channel: Channel; adapter: BaseAdapter }[]> {
  const { data: creds } = await supabase
    .from('channel_credentials')
    .select('channel, credentials')
    .eq('megaload_user_id', megaloadUserId)
    .eq('is_connected', true);

  if (!creds || creds.length === 0) return [];

  const results: { channel: Channel; adapter: BaseAdapter }[] = [];
  for (const cred of creds) {
    try {
      const adapter = createAdapter(cred.channel as Channel);
      await adapter.authenticate(cred.credentials as Record<string, unknown>);
      results.push({ channel: cred.channel as Channel, adapter });
    } catch {
      // 인증 실패한 채널 건너뛰기
    }
  }
  return results;
}
