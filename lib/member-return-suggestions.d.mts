import type { TableTodaySuggestion } from '../components/member/your-table-today';
export type ReturnCommunity = {
  name: string; slug: string; tagline?: string | null;
  new_activity_count?: number; new_conversation_count?: number; new_reply_count?: number;
};
export type ReturnEvent = { ends_at?: string; slug: string; title: string };
export type MemberNextAction = { label: string; action: string; href: string; description: string };
export function communityReturnSuggestion(options: { community?: ReturnCommunity; enabled: boolean; featureError: boolean; communityError: boolean; activityError: boolean }): TableTodaySuggestion;
export function recentPastEvent<T extends ReturnEvent>(events: T[], now?: number): T | null;
export function memberNextSuggestion(options: { unreadMessages: number; dueFollowups: { next_step: string; display_name: string }[]; pastEvent: ReturnEvent | null; unreadNotifications: number; fallback: MemberNextAction }): MemberNextAction;
