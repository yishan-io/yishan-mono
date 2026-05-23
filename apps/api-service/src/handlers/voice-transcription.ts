import type { AppContext } from "@/hono";
import type { VoiceTranscriptionBodyInput, VoiceTranscriptionParamsInput } from "@/validation/voice-transcription";

export async function voiceTranscribeHandler(
  c: AppContext,
  params: VoiceTranscriptionParamsInput,
  body: VoiceTranscriptionBodyInput,
) {
  const actorUser = c.get("sessionUser");
  const result = await c.get("services").voiceTranscription.transcribe({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    organizationRole: c.get("organizationRole"),
    audioData: body.audioData,
    audioFormat: body.audioFormat,
    durationSeconds: body.durationSeconds,
    prompt: body.prompt,
  });

  return c.json(result);
}
