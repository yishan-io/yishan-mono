import { requestJson } from "./restClient";
import type { VoiceTranscriptionResponse } from "./types";

function getAudioFormat(audio: Blob): "webm" | "wav" | "mp4" | "ogg" | "m4a" {
  if (audio.type.includes("wav")) {
    return "wav";
  }
  if (audio.type.includes("m4a")) {
    return "m4a";
  }
  if (audio.type.includes("mp4")) {
    return "mp4";
  }
  if (audio.type.includes("ogg")) {
    return "ogg";
  }

  return "webm";
}

async function blobToBase64(audio: Blob): Promise<string> {
  const buffer = await audio.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function transcribeVoice(input: {
  orgId: string;
  audio: Blob;
  durationSeconds: number;
  prompt?: string;
}): Promise<VoiceTranscriptionResponse> {
  return requestJson<VoiceTranscriptionResponse>(`/orgs/${input.orgId}/voice-transcribe`, {
    method: "POST",
    body: {
      audioData: await blobToBase64(input.audio),
      audioFormat: getAudioFormat(input.audio),
      durationSeconds: input.durationSeconds,
      ...(input.prompt?.trim() ? { prompt: input.prompt.trim() } : {}),
    },
  });
}
