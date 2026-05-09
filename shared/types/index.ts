// Shared TypeScript types for Messagent — used by both backend and mobile packages

export type Platform = 'gmail' | 'whatsapp' | 'instagram' | 'telegram';

export type AgentMode = 'owner' | 'assistant';

export type AgentTier = 'free' | 'pro' | 'business';

export type MessageStatus = 'pending' | 'replied' | 'skipped' | 'failed';

/**
 * Per-platform configuration for the agent.
 * scheduleStart / scheduleEnd are "HH:MM" strings in UTC (null = always active).
 */
export interface PlatformConfig {
  platform: Platform;
  enabled: boolean;
  mode: AgentMode;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  userInstructions: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  tier: AgentTier;
  platforms: PlatformConfig[];
}

export interface Message {
  id: string;
  platform: Platform;
  fromContact: string;
  body: string;
  receivedAt: string; // ISO 8601
  status: MessageStatus;
}

/**
 * rating: 1 = thumbs up, -1 = thumbs down, null = unrated
 */
export interface ReplyLog {
  id: string;
  messageId: string;
  replyBody: string;
  modelUsed: string;
  sentAt: string | null;
  rating: 1 | -1 | null;
}
