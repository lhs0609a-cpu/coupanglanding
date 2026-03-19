import type { Channel } from '../types';
import { CHANNEL_RATE_LIMITS } from '../constants';

interface RateLimitEntry {
  calls: number[];
}

// In-memory rate limiter (for production, use Redis)
const rateLimitStore = new Map<string, RateLimitEntry>();

export class RateLimiter {
  static async checkLimit(channel: Channel, userId: string): Promise<boolean> {
    const key = `${channel}:${userId}`;
    const config = CHANNEL_RATE_LIMITS[channel];
    const now = Date.now();

    let entry = rateLimitStore.get(key);
    if (!entry) {
      entry = { calls: [] };
      rateLimitStore.set(key, entry);
    }

    // Remove expired entries
    entry.calls = entry.calls.filter((t) => now - t < config.windowMs);

    if (entry.calls.length >= config.maxCalls) {
      return false; // Rate limited
    }

    entry.calls.push(now);
    return true;
  }

  static async waitForSlot(channel: Channel, userId: string): Promise<void> {
    const config = CHANNEL_RATE_LIMITS[channel];

    while (!(await this.checkLimit(channel, userId))) {
      await new Promise((resolve) => setTimeout(resolve, config.windowMs / config.maxCalls));
    }
  }

  static getRemainingCalls(channel: Channel, userId: string): number {
    const key = `${channel}:${userId}`;
    const config = CHANNEL_RATE_LIMITS[channel];
    const now = Date.now();

    const entry = rateLimitStore.get(key);
    if (!entry) return config.maxCalls;

    const activeCalls = entry.calls.filter((t) => now - t < config.windowMs).length;
    return Math.max(0, config.maxCalls - activeCalls);
  }
}
