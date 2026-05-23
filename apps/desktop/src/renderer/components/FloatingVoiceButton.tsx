import { Box, IconButton, Tooltip } from "@mui/material";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { LuArrowUp, LuLoaderCircle, LuMic, LuX } from "react-icons/lu";
import { transcribeVoiceForOrganization } from "../commands/voiceTranscriptionCommands";
import { getErrorMessage } from "../helpers/errorHelpers";
import { sessionStore } from "../store/sessionStore";

const MAX_RECORDING_MS = 60_000;
const AUDIO_BITS_PER_SECOND = 48_000;

function resolveAudioMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

type RecordingState = "idle" | "recording" | "ready" | "transcribing";

type FloatingVoiceButtonProps = {
  onText: (text: string) => Promise<void> | void;
  disabled?: boolean;
  disabledMessage?: string;
  rightOffset?: number;
};

export function FloatingVoiceButton({ onText, disabled = false, disabledMessage, rightOffset = 0 }: FloatingVoiceButtonProps) {
  const location = useLocation();
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordedAudio, setRecordedAudio] = useState<{ audio: Blob; durationSeconds: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<number | null>(null);
  const didCancelRecordingRef = useRef(false);
  const didSubmitRecordingRef = useRef(false);

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

  const clearRecordedAudio = useCallback(() => {
    setRecordedAudio(null);
    setRecordingState("idle");
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
      stopTimerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
    } catch (error) {
      cleanupRecording();
      setRecordingState("idle");
      setErrorMessage(getErrorMessage(error));
    }
  }, [cleanupRecording, clearRecordedAudio, disabled, disabledMessage, stopRecording]);

  const handleClick = () => {
    setErrorMessage(null);
    void startRecording();
  };

  const handleSubmit = async () => {
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
  };

  const isBusy = recordingState !== "idle";
  const label =
    recordingState === "recording"
      ? "Recording voice input"
      : recordingState === "ready"
        ? "Voice input ready"
      : recordingState === "transcribing"
        ? "Transcribing voice"
        : "Click to record voice input";

  const button = (
    <Box sx={{ position: "fixed", right: 18 + rightOffset, bottom: 18, zIndex: 9 }}>
      <Tooltip title={recordingState === "idle" ? (disabled ? (disabledMessage ?? label) : label) : (errorMessage ?? label)} placement="left">
        <span>
          <IconButton
            aria-label={label}
            size="small"
            onClick={handleClick}
            disabled={isBusy}
            sx={{
              width: isBusy ? 220 : 34,
              height: 34,
              justifyContent: isBusy ? "flex-start" : "center",
              gap: 1,
              px: isBusy ? 1.25 : 0,
              color: recordingState === "recording" ? "success.main" : "grey.100",
              bgcolor: recordingState === "recording" ? "rgba(46, 125, 50, 0.16)" : "rgba(15, 18, 24, 0.74)",
              border: "1px solid",
              borderColor: "rgba(255, 255, 255, 0.12)",
              backdropFilter: "blur(8px)",
              borderRadius: 999,
              transition: "width 160ms ease, background-color 120ms ease, border-color 120ms ease",
              "&:hover": {
                bgcolor: recordingState === "recording" ? "rgba(46, 125, 50, 0.24)" : "rgba(30, 36, 48, 0.88)",
              },
              "& .voice-spin-icon": {
                animation: "voice-spin 900ms linear infinite",
              },
              "@keyframes voice-spin": {
                "0%": { transform: "rotate(0deg)" },
                "100%": { transform: "rotate(360deg)" },
              },
            }}
          >
            {recordingState === "transcribing" ? (
              <LuLoaderCircle className="voice-spin-icon" color="white" size={16} />
            ) : (
              <LuMic size={16} />
            )}
            {recordingState === "transcribing" ? (
              <Box sx={{ flex: 1, pr: 3.5, pl: 1, fontSize: 12, color: "grey.100", textAlign: "left" }}>
                Transcribing...
              </Box>
            ) : isBusy ? (
              <Waveform isActive={recordingState === "recording"} />
            ) : null}
          </IconButton>
        </span>
      </Tooltip>
      {recordingState === "recording" || recordingState === "ready" ? (
        <Tooltip title="Cancel voice input" placement="top">
          <IconButton
            aria-label="Cancel voice input"
            size="small"
            onClick={cancelRecording}
            sx={{
              position: "absolute",
              left: 4,
              top: "50%",
              transform: "translateY(-50%)",
              width: 26,
              height: 26,
              borderRadius: "50%",
              color: "grey.100",
              bgcolor: "rgba(255, 255, 255, 0.08)",
              "&:hover": { bgcolor: "rgba(255, 255, 255, 0.14)" },
            }}
          >
            <LuX size={16} />
          </IconButton>
        </Tooltip>
      ) : null}
      {recordingState === "recording" || recordingState === "ready" ? (
        <Tooltip title="Submit voice input" placement="top">
          <IconButton
            aria-label="Submit voice input"
            size="small"
            onClick={handleSubmit}
            sx={{
              position: "absolute",
              right: 4,
              top: "50%",
              transform: "translateY(-50%)",
              width: 26,
              height: 26,
              borderRadius: "50%",
              color: "grey.100",
              bgcolor: "rgba(255, 255, 255, 0.08)",
              "&:hover": { bgcolor: "rgba(255, 255, 255, 0.14)" },
            }}
          >
            <LuArrowUp size={16} />
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );

  if (location.pathname !== "/") {
    return null;
  }

  return portalHost ? createPortal(button, portalHost) : null;
}

function Waveform({ isActive }: { isActive: boolean }) {
  const bars = [12, 18, 9, 22, 14, 19, 10, 16, 21, 11, 17, 13];

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.45, flex: 1, pr: 3.5, pl: 3.5 }}>
      {bars.map((height, index) => (
        <Box
          key={`${height}-${index}`}
          sx={{
            width: 3,
            height,
            borderRadius: 99,
            bgcolor: isActive ? "success.main" : "grey.300",
            opacity: isActive ? 0.95 : 0.6,
            animation: isActive ? "voice-wave 850ms ease-in-out infinite" : "none",
            animationDelay: `${index * 62}ms`,
            "@keyframes voice-wave": {
              "0%, 100%": { transform: "scaleY(0.45)" },
              "50%": { transform: "scaleY(1.15)" },
            },
          }}
        />
      ))}
    </Box>
  );
}
