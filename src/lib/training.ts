export interface TrainingBooking { id: string; name: string; phone: string; created_at: string; }
export interface TrainingSession {
  id: string; title: string; starts_at: string; ends_at: string; capacity: number | null;
  instructions: string; is_open: boolean; booked: number; bookings?: TrainingBooking[];
}
export const koreaDate = (date: string | Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
export const koreaTime = (date: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(date));
export function sessionLabel(s: TrainingSession) { return `${koreaDate(s.starts_at)} ${koreaTime(s.starts_at)}–${koreaTime(s.ends_at)}`; }
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TRAINING_CHAT_URL = 'https://open.kakao.com/o/gmQmvkUi';
