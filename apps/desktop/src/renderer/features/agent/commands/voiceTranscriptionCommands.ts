import { api } from "../../../api";
import { setOrganizationVoiceUsage } from "../../../features/session/state/sessionActions";

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
  const usage = await api.voiceTranscription.getUsage(input.organizationId);
  setOrganizationVoiceUsage(input.organizationId, usage);

  return result;
}
