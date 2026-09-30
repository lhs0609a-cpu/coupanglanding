/** Public allowlist already used by /my/settings and the academy. Never put API keys here. */
export const COUPANG_CONNECTION_IPS = [
  '209.71.88.111', '66.241.125.108', '216.246.19.71', '66.241.124.130',
  '216.246.19.84', '14.52.102.116', '54.116.7.181', '3.37.67.57',
  '79.127.159.103', '216.246.19.66',
] as const;
export const COUPANG_CONNECTION_IP_TEXT = COUPANG_CONNECTION_IPS.join(', ');
export const COUPANG_CONNECTION_URL = 'https://coupanglanding.vercel.app/';
