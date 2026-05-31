import { useCallback, useEffect, useRef, useState } from "react";
import recordStartSound from "../../assets/record-start.mp3";
import { transcribeVoiceForOrganization } from "../commands/voiceTranscriptionCommands";
import { getErrorMessage } from "../helpers/errorHelpers";
import { sessionStore } from "../store/sessionStore";

const MAX_RECORDING_MS = 60_000;
const AUDIO_BITS_PER_SECOND = 48_000;

function resolveAudioMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

export type RecordingState = "idle" | "recording" | "ready" | "transcribing";

type UseVoiceRecordingInput = {
  onText: (text: string) => Promise<void> | void;
  disabled?: boolean;
  disabledMessage?: string;
};

export type UseVoiceRecordingResult = {
  recordingState: RecordingState;
  errorMessage: string | null;
  elapsedSeconds: number;
  recordedAudio: { audio: Blob; durationSeconds: number } | null;
  activeStream: MediaStream | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  handleSubmit: () => Promise<void>;
  setErrorMessage: (message: string | null) => void;
};

/**
 * Manages the voice recording state machine: start → recording → ready/transcribing → idle.
 * Handles MediaRecorder lifecycle, timers, and transcription API calls.
 */
export function useVoiceRecording({ onText, disabled = false, disabledMessage }: UseVoiceRecordingInput): UseVoiceRecordingResult {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordedAudio, setRecordedAudio] = useState<{ audio: Blob; durationSeconds: number } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<number | null>(null);
  const countTimerRef = useRef<number | null>(null);
  const didCancelRecordingRef = useRef(false);
  const didSubmitRecordingRef = useRef(false);

  const cleanupRecording = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    if (countTimerRef.current !== null) {
      window.clearInterval(countTimerRef.current);
      countTimerRef.current = null;
    }

    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }

    recorderRef.current = null;
    streamRef.current = null;
  }, []);

  const clearRecordedAudio = useCallback(() => {
    setRecordedAudio(null);
    setRecordingState("idle");
  }, []);

  useEffect(() => {
    return cleanupRecording;
  }, [cleanupRecording]);

  const transcribeRecording = useCallback(
    async (audio: Blob, durationSeconds: number) => {
      if (import.meta.env.DEV) {
        console.info("[voice-transcription] audio blob", {
          size: audio.size,
          type: audio.type,
          durationSeconds,
        });
      }

      const organizationId = sessionStore.getState().selectedOrganizationId?.trim();
      if (!organizationId) {
        setErrorMessage("Select an organization before using voice input.");
        clearRecordedAudio();
        return;
      }

      try {
        setRecordingState("transcribing");
        const result = await transcribeVoiceForOrganization({ organizationId, audio, durationSeconds });
        await onText(result.optimizedText);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setRecordedAudio(null);
        setRecordingState("idle");
      }
    },
    [clearRecordedAudio, onText],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    didCancelRecordingRef.current = true;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
    } else {
      cleanupRecording();
    }
    setErrorMessage(null);
    clearRecordedAudio();
  }, [cleanupRecording, clearRecordedAudio]);

  useEffect(() => {
    if (recordingState !== "recording" && recordingState !== "ready") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      cancelRecording();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [cancelRecording, recordingState]);

  const startRecording = useCallback(async () => {
    if (disabled) {
      setErrorMessage(disabledMessage ?? "Voice input is not available here.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Voice recording is not supported in this environment.");
      return;
    }

    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = resolveAudioMimeType();
      const recorder = new MediaRecorder(stream, {
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
        ...(mimeType ? { mimeType } : {}),
      });
      const chunks: Blob[] = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      didCancelRecordingRef.current = false;
      didSubmitRecordingRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (didCancelRecordingRef.current) {
          cleanupRecording();
          return;
        }

        const durationSeconds = Math.max(1, Math.min(60, Math.ceil((Date.now() - startedAtRef.current) / 1_000)));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        cleanupRecording();
        if (audio.size === 0) {
          setErrorMessage("No audio was recorded. Check microphone input and permission settings.");
          clearRecordedAudio();
          return;
        }

        if (didSubmitRecordingRef.current) {
          void transcribeRecording(audio, durationSeconds);
          return;
        }

        setRecordedAudio({ audio, durationSeconds });
        setRecordingState("ready");
      };

      recorder.start(1_000);
      setRecordingState("recording");
      setElapsedSeconds(0);
      const audio = new Audio(recordStartSound);
      audio.currentTime = 0.4;
      audio.play().catch(() => {});
      stopTimerRef.current = window.setTimeout(() => {
        didSubmitRecordingRef.current = true;
        setRecordingState("transcribing");
        stopRecording();
      }, MAX_RECORDING_MS);
      countTimerRef.current = window.setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1_000);
    } catch (error) {
      cleanupRecording();
      setRecordingState("idle");
      setErrorMessage(getErrorMessage(error));
    }
  }, [cleanupRecording, clearRecordedAudio, disabled, disabledMessage, stopRecording]);

  const handleSubmit = useCallback(async () => {
    if (recordingState === "recording") {
      didSubmitRecordingRef.current = true;
      setRecordingState("transcribing");
      stopRecording();
      return;
    }

    if (!recordedAudio || recordingState !== "ready") {
      return;
    }

    const audioToSubmit = recordedAudio;
    setRecordedAudio(null);
    await transcribeRecording(audioToSubmit.audio, audioToSubmit.durationSeconds);
  }, [recordedAudio, recordingState, stopRecording, transcribeRecording]);

  return {
    recordingState,
    errorMessage,
    elapsedSeconds,
    recordedAudio,
    activeStream: streamRef.current,
    startRecording,
    stopRecording,
    cancelRecording,
    handleSubmit,
    setErrorMessage,
  };
}
