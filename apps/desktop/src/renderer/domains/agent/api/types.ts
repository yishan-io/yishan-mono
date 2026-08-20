/**
 * Agent REST/DTO record types (Desktop 11 Phase 47 — moved from the Renderer
 * root `api/types.ts`).
 */

export type VoiceTranscriptionUsageRecord = {
  quotaMinutes: number;
  usedSeconds: number;
  remainingSeconds: number;
};

export type VoiceTranscriptionResponse = {
  transcript: string;
  optimizedText: string;
};
