import { api } from "../api";

export async function transcribeVoiceForOrganization(input: {
  organizationId: string;
  audio: Blob;
  durationSeconds: number;
}) {
  return api.voiceTranscription.transcribe({
    orgId: input.organizationId,
    audio: input.audio,
    durationSeconds: input.durationSeconds,
  });
}
