import { and, eq, gte, sql } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import type { OrganizationMemberRole, OrganizationPlan } from "@/db/schema";
import { organizations, voiceUsageActivities } from "@/db/schema";
import {
  AppError,
  OrganizationNotFoundError,
  SpeechToTextInvalidAudioError,
  SpeechToTextNoSpeechDetectedError,
  SpeechToTextOptimizationFailedError,
  SpeechToTextTranscriptionFailedError,
  VoiceTranscriptionPlanRequiredError,
  VoiceTranscriptionQuotaExceededError,
} from "@/errors";
import { newId } from "@/lib/id";
import type { OrganizationService } from "@/services/organization-service";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";
import type { ServiceConfig } from "@/types";

const OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";
const TRANSCRIPTION_MODEL = "openai/gpt-4o-mini-transcribe";
const OPTIMIZATION_MODEL = "openai/gpt-4o-mini";
const TRANSCRIPTION_PROMPT =
  "The speaker is likely a software engineer or developer dictating instructions for an agent CLI. Prefer common software terms, command names, flags, package names, file paths, APIs, frameworks, programming languages, git terminology, and code-related words when audio is ambiguous.";

const PLAN_QUOTA_MINUTES: Record<Exclude<OrganizationPlan, "free">, number> = {
  pro: 300,
  premium: 1_000,
};

export type VoiceTranscriptionUsageView = {
  quotaMinutes: number;
  usedSeconds: number;
  remainingSeconds: number;
};

type OpenAITextResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

type OpenAITranscriptionResponse = {
  text?: unknown;
  transcription?: unknown;
  output_text?: unknown;
  error?: unknown;
};

type OpenAIErrorResponse = {
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
  };
};

async function readOpenAIError(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await response.json()) as OpenAIErrorResponse;
    return {
      providerStatus: response.status,
      providerError: typeof body.error?.message === "string" ? body.error.message : response.statusText,
      providerErrorType: typeof body.error?.type === "string" ? body.error.type : undefined,
      providerErrorCode: typeof body.error?.code === "string" ? body.error.code : undefined,
    };
  } catch {
    return { providerStatus: response.status, providerError: response.statusText };
  }
}

type TranscribeInput = {
  actorUserId: string;
  organizationId: string;
  organizationRole?: OrganizationMemberRole;
  audioData: string;
  audioFormat: "webm" | "wav" | "mp4" | "ogg" | "m4a";
  durationSeconds: number;
  prompt?: string;
};

export class VoiceTranscriptionService {
  constructor(
    private readonly db: AppDb,
    private readonly config: ServiceConfig,
    private readonly organizationService: OrganizationService,
  ) {}

  async transcribe(input: TranscribeInput): Promise<{
    transcript: string;
    optimizedText: string;
  }> {
    if (input.audioData.trim().length === 0) {
      throw new SpeechToTextInvalidAudioError();
    }

    await assertOrganizationMember(
      this.organizationService,
      input.organizationId,
      input.actorUserId,
      input.organizationRole,
    );

    await this.assertQuotaAvailable(input);

    try {
      const transcript = await this.transcribeAudio(input.audioData, input.audioFormat, input.prompt);
      const optimizedText = await this.optimizeTranscript(transcript, input.prompt);
      await this.recordUsage(input, "succeeded");

      return {
        transcript,
        optimizedText,
      };
    } catch (error) {
      await this.recordUsage(input, "failed", error instanceof AppError ? error.code : "VOICE_TRANSCRIPTION_FAILED");
      throw error;
    }
  }

  async getUsage(input: {
    actorUserId: string;
    organizationId: string;
    organizationRole?: OrganizationMemberRole;
  }): Promise<VoiceTranscriptionUsageView> {
    await assertOrganizationMember(
      this.organizationService,
      input.organizationId,
      input.actorUserId,
      input.organizationRole,
    );

    return this.getUsageForOrganization(input);
  }

  private async assertQuotaAvailable(input: TranscribeInput) {
    const quota = await this.getQuota(input);

    if (input.durationSeconds > quota.remainingSeconds) {
      throw new VoiceTranscriptionQuotaExceededError({
        plan: quota.plan,
        quotaMinutes: quota.quotaMinutes,
        usedSeconds: quota.usedSeconds,
        requestedSeconds: input.durationSeconds,
        remainingSeconds: Math.max(quota.remainingSeconds, 0),
      });
    }

    return quota;
  }

  private async getQuota(input: {
    actorUserId: string;
    organizationId: string;
  }): Promise<VoiceTranscriptionUsageView & { plan: Exclude<OrganizationPlan, "free"> }> {
    const organizationRows = await this.db
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
    const plan = organizationRows[0]?.plan;

    if (!plan) {
      throw new OrganizationNotFoundError(input.organizationId);
    }

    if (plan === "free") {
      throw new VoiceTranscriptionPlanRequiredError();
    }

    return { plan, ...(await this.buildUsage(input, plan)) };
  }

  private async getUsageForOrganization(input: {
    actorUserId: string;
    organizationId: string;
  }): Promise<VoiceTranscriptionUsageView> {
    const organizationRows = await this.db
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
    const plan = organizationRows[0]?.plan;

    if (!plan) {
      throw new OrganizationNotFoundError(input.organizationId);
    }

    return this.buildUsage(input, plan);
  }

  private async buildUsage(
    input: { actorUserId: string; organizationId: string },
    plan: OrganizationPlan,
  ): Promise<VoiceTranscriptionUsageView> {
    if (plan === "free") {
      return { quotaMinutes: 0, usedSeconds: 0, remainingSeconds: 0 };
    }

    const quotaMinutes = PLAN_QUOTA_MINUTES[plan];
    const quotaSeconds = quotaMinutes * 60;
    const usedSeconds = await this.getUsedSeconds(input, plan);
    const remainingSeconds = quotaSeconds - usedSeconds;

    return { quotaMinutes, usedSeconds, remainingSeconds: Math.max(remainingSeconds, 0) };
  }

  private async getUsedSeconds(
    input: { actorUserId: string; organizationId: string },
    plan: Exclude<OrganizationPlan, "free">,
  ): Promise<number> {
    const monthStart = this.getMonthStart(new Date());
    const filters = [
      eq(voiceUsageActivities.organizationId, input.organizationId),
      eq(voiceUsageActivities.status, "succeeded"),
      gte(voiceUsageActivities.createdAt, monthStart),
    ];

    if (plan === "pro") {
      filters.push(eq(voiceUsageActivities.userId, input.actorUserId));
    }

    const rows = await this.db
      .select({ totalSeconds: sql<number>`coalesce(sum(${voiceUsageActivities.durationSeconds}), 0)::int` })
      .from(voiceUsageActivities)
      .where(and(...filters));

    return rows[0]?.totalSeconds ?? 0;
  }

  private getMonthStart(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private async recordUsage(input: TranscribeInput, status: "succeeded" | "failed", errorCode?: string): Promise<void> {
    await this.db.insert(voiceUsageActivities).values({
      id: newId(),
      organizationId: input.organizationId,
      userId: input.actorUserId,
      durationSeconds: input.durationSeconds,
      status,
      errorCode,
    });
  }

  private async transcribeAudio(audioData: string, audioFormat: string, prompt?: string): Promise<string> {
    const response = await fetch(`${OPENROUTER_API_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TRANSCRIPTION_MODEL,
        input_audio: {
          data: audioData,
          format: audioFormat,
        },
        prompt: [TRANSCRIPTION_PROMPT, prompt?.trim()].filter(Boolean).join("\n\n"),
      }),
    });

    if (!response.ok) {
      throw new SpeechToTextTranscriptionFailedError(await readOpenAIError(response));
    }

    const body = (await response.json()) as OpenAITranscriptionResponse;
    const transcript = this.getTranscriptionText(body);
    if (!transcript) {
      if (typeof body.text === "string" && body.text.trim().length === 0) {
        throw new SpeechToTextNoSpeechDetectedError({
          providerStatus: response.status,
          providerResponse: body,
        });
      }

      throw new SpeechToTextTranscriptionFailedError({
        providerStatus: response.status,
        providerError: "OpenRouter transcription response did not include text",
        providerResponseKeys: Object.keys(body),
        providerResponse: body,
      });
    }

    return transcript;
  }

  private getTranscriptionText(body: OpenAITranscriptionResponse): string | null {
    for (const value of [body.text, body.transcription, body.output_text]) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private async optimizeTranscript(transcript: string, prompt?: string): Promise<string> {
    const promptPrefix = prompt ? `${prompt.trim()}\n\nTranscript:\n` : "Transcript:\n";
    const response = await fetch(`${OPENROUTER_API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPTIMIZATION_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Rewrite speech-to-text output into clear, well-structured input for an agent CLI. Preserve the user's intent, concrete names, paths, commands, flags, and constraints. Fix transcription mistakes only when obvious. Return only the optimized CLI prompt text.",
          },
          {
            role: "user",
            content: `${promptPrefix}${transcript}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new SpeechToTextOptimizationFailedError(await readOpenAIError(response));
    }

    const body = (await response.json()) as OpenAITextResponse;
    const optimizedText = this.getResponseText(body);
    if (!optimizedText) {
      throw new SpeechToTextOptimizationFailedError();
    }

    return optimizedText;
  }

  private getResponseText(body: OpenAITextResponse): string | null {
    const content = body.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim().length > 0) {
      return content.trim();
    }

    return null;
  }
}
