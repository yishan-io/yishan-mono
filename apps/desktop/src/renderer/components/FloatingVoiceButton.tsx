import { Box, CircularProgress, IconButton, Tooltip } from "@mui/material";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuMic, LuMicOff, LuSquare } from "react-icons/lu";
import { transcribeVoiceForOrganization } from "../commands/voiceTranscriptionCommands";
import { getErrorMessage } from "../helpers/errorHelpers";
import { sessionStore } from "../store/sessionStore";

const MAX_RECORDING_MS = 60_000;
const AUDIO_BITS_PER_SECOND = 48_000;

function resolveAudioMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

type RecordingState = "idle" | "recording" | "transcribing";

type FloatingVoiceButtonProps = {
  onText: (text: string) => Promise<void> | void;
  disabled?: boolean;
  disabledMessage?: string;
};

export function FloatingVoiceButton({ onText, disabled = false, disabledMessage }: FloatingVoiceButtonProps) {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<number | null>(null);

  const cleanupRecording = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }

    recorderRef.current = null;
    streamRef.current = null;
  }, []);

  useEffect(() => {
    setPortalHost(document.body);
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
        setRecordingState("idle");
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
        setRecordingState("idle");
      }
    },
    [onText],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
    }
  }, []);

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

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const durationSeconds = Math.max(1, Math.min(60, Math.ceil((Date.now() - startedAtRef.current) / 1_000)));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        cleanupRecording();
        if (audio.size === 0) {
          setErrorMessage("No audio was recorded. Check microphone input and permission settings.");
          setRecordingState("idle");
          return;
        }

        void transcribeRecording(audio, durationSeconds);
      };

      recorder.start(1_000);
      setRecordingState("recording");
      stopTimerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
    } catch (error) {
      cleanupRecording();
      setRecordingState("idle");
      setErrorMessage(getErrorMessage(error));
    }
  }, [cleanupRecording, disabled, disabledMessage, stopRecording, transcribeRecording]);

  const handleClick = () => {
    if (recordingState === "recording") {
      stopRecording();
      return;
    }

    void startRecording();
  };

  const isBusy = recordingState !== "idle";
  const label =
    recordingState === "recording"
      ? "Stop voice input"
      : recordingState === "transcribing"
        ? "Transcribing voice"
        : "Record voice input";

  const button = (
    <Box sx={{ position: "fixed", right: 18, bottom: 18, zIndex: 2147483647 }}>
      <Tooltip title={errorMessage ?? (disabled ? (disabledMessage ?? label) : label)} placement="left">
        <span>
          <IconButton
            aria-label={label}
            size="small"
            onClick={handleClick}
            disabled={recordingState === "transcribing"}
            sx={{
              width: 34,
              height: 34,
              color: recordingState === "recording" ? "error.main" : "grey.100",
              bgcolor: recordingState === "recording" ? "rgba(244, 67, 54, 0.16)" : "rgba(15, 18, 24, 0.74)",
              border: "1px solid",
              borderColor: recordingState === "recording" ? "error.main" : "rgba(255, 255, 255, 0.12)",
              backdropFilter: "blur(8px)",
              "&:hover": {
                bgcolor: recordingState === "recording" ? "rgba(244, 67, 54, 0.24)" : "rgba(30, 36, 48, 0.88)",
              },
            }}
          >
            {recordingState === "transcribing" ? (
              <CircularProgress size={15} color="inherit" />
            ) : recordingState === "recording" ? (
              <LuSquare size={15} />
            ) : (
              <LuMic size={16} />
            )}
          </IconButton>
        </span>
      </Tooltip>
      {isBusy ? (
        <Box
          sx={{
            position: "absolute",
            right: 42,
            top: "50%",
            transform: "translateY(-50%)",
            px: 1,
            py: 0.35,
            borderRadius: 999,
            bgcolor: "rgba(15, 18, 24, 0.8)",
            color: "grey.100",
            fontSize: 11,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {recordingState === "recording" ? "Recording" : "Transcribing"}
        </Box>
      ) : null}
    </Box>
  );

  return portalHost ? createPortal(button, portalHost) : null;
}
