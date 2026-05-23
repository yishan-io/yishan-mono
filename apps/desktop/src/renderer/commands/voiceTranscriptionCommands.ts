import { api } from "../api";
import { sessionStore } from "../store/sessionStore";

export async function transcribeVoiceForOrganization(input: {
  organizationId: string;
  audio: Blob;
  durationSeconds: number;
}) {
  const result = await api.voiceTranscription.transcribe({
    orgId: input.organizationId,
    audio: input.audio,
    durationSeconds: input.durationSeconds,
  });
  sessionStore.getState().setOrganizationVoiceUsage(input.organizationId, result.usage);

  return result;
}
