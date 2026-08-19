import { setOrganizationVoiceUsage } from "../../../domains/session";
import { getVoiceTranscriptionUsage, transcribeVoice } from "../infrastructure/voiceTranscriptionApi";

export async function transcribeVoiceForOrganization(input: {
  organizationId: string;
  audio: Blob;
  durationSeconds: number;
}) {
  const result = await transcribeVoice({
    orgId: input.organizationId,
    audio: input.audio,
    durationSeconds: input.durationSeconds,
  });
  const usage = await getVoiceTranscriptionUsage(input.organizationId);
  setOrganizationVoiceUsage(input.organizationId, usage);

  return result;
}
