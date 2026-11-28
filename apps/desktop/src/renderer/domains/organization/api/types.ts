/**
 * Organization REST/DTO record types (Desktop 11 Phase 47 — moved from the
 * Renderer root `api/types.ts`).
 */

import type { VoiceTranscriptionUsageRecord } from "@renderer/domains/agent";

export type OrganizationRecord = {
  id: string;
  name: string;
  plan?: "free" | "pro" | "premium";
  members?: OrganizationMemberRecord[];
  voiceUsage?: VoiceTranscriptionUsageRecord;
};

export type OrganizationMemberRecord = {
  userId: string;
  role: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};
