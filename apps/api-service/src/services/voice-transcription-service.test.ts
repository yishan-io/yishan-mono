import { describe, expect, it, vi } from "vitest";

import {
  SpeechToTextInvalidAudioError,
  SpeechToTextNoSpeechDetectedError,
  VoiceTranscriptionPlanRequiredError,
} from "@/errors";
import { VoiceTranscriptionService } from "@/services/voice-transcription-service";
import type { ServiceConfig } from "@/types";

const config = {
  openrouterApiKey: "test-openrouter-key",
} as ServiceConfig;

function makeDb(plan: "free" | "pro" | "premium", usedSeconds = 0) {
  const insertedValues: unknown[] = [];
  let selectCalls = 0;
  const db = {
    insertedValues,
    select: vi.fn(() => {
      selectCalls += 1;
      if (selectCalls === 1) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{ plan }]),
            })),
          })),
        };
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ totalSeconds: usedSeconds }]),
        })),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: unknown) => {
        insertedValues.push(values);
      }),
    })),
  };

  return db;
}

const organizationService = {
  getMembershipRole: vi.fn(async () => "member"),
} as never;

describe("VoiceTranscriptionService", () => {
  it("rejects empty audio files", async () => {
    const service = new VoiceTranscriptionService(makeDb("pro") as never, config, organizationService);

    await expect(
      service.transcribe({
        actorUserId: "user-1",
        organizationId: "org-1",
        audioData: "",
        audioFormat: "webm",
        durationSeconds: 1,
      }),
    ).rejects.toBeInstanceOf(SpeechToTextInvalidAudioError);
  });

  it("blocks free organizations", async () => {
    const service = new VoiceTranscriptionService(makeDb("free") as never, config, organizationService);

    await expect(
      service.transcribe({
        actorUserId: "user-1",
        organizationId: "org-1",
        audioData: "YXVkaW8=",
        audioFormat: "webm",
        durationSeconds: 60,
      }),
    ).rejects.toBeInstanceOf(VoiceTranscriptionPlanRequiredError);
  });

  it("returns monthly usage for paid organizations", async () => {
    const service = new VoiceTranscriptionService(makeDb("pro", 90) as never, config, organizationService);

    await expect(
      service.getUsage({
        actorUserId: "user-1",
        organizationId: "org-1",
      }),
    ).resolves.toEqual({
      quotaMinutes: 300,
      usedSeconds: 90,
      remainingSeconds: 17_910,
    });
  });

  it("returns zero usage for free organizations", async () => {
    const service = new VoiceTranscriptionService(makeDb("free") as never, config, organizationService);

    await expect(
      service.getUsage({
        actorUserId: "user-1",
        organizationId: "org-1",
      }),
    ).resolves.toEqual({
      quotaMinutes: 0,
      usedSeconds: 0,
      remainingSeconds: 0,
    });
  });

  it("transcribes audio, optimizes it, and records usage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "fix the broken tests and commit it" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Fix the failing tests, then create a commit with the changes." } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const db = makeDb("pro");
    const service = new VoiceTranscriptionService(db as never, config, organizationService);

    const result = await service.transcribe({
      actorUserId: "user-1",
      organizationId: "org-1",
      audioData: "YXVkaW8=",
      audioFormat: "webm",
      durationSeconds: 120,
    });

    expect(result).toEqual({
      transcript: "fix the broken tests and commit it",
      optimizedText: "Fix the failing tests, then create a commit with the changes.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(db.insertedValues).toMatchObject([
      {
        organizationId: "org-1",
        userId: "user-1",
        durationSeconds: 120,
        status: "succeeded",
      },
    ]);

    vi.unstubAllGlobals();
  });

  it("reports no speech when provider returns an empty transcript", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "", usage: { total_tokens: 21 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const db = makeDb("pro");
    const service = new VoiceTranscriptionService(db as never, config, organizationService);

    await expect(
      service.transcribe({
        actorUserId: "user-1",
        organizationId: "org-1",
        audioData: "YXVkaW8=",
        audioFormat: "webm",
        durationSeconds: 3,
      }),
    ).rejects.toBeInstanceOf(SpeechToTextNoSpeechDetectedError);
    expect(db.insertedValues).toMatchObject([
      {
        organizationId: "org-1",
        userId: "user-1",
        durationSeconds: 3,
        status: "failed",
        errorCode: "SPEECH_TO_TEXT_NO_SPEECH_DETECTED",
      },
    ]);

    vi.unstubAllGlobals();
  });
});
