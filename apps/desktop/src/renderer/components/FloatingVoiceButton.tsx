import { Box, IconButton, Tooltip } from "@mui/material";
import { createPortal } from "react-dom";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { LuArrowUp, LuLoaderCircle, LuMic, LuX } from "react-icons/lu";
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

type RecordingState = "idle" | "recording" | "ready" | "transcribing";

type FloatingVoiceButtonProps = {
  onText: (text: string) => Promise<void> | void;
  disabled?: boolean;
  disabledMessage?: string;
  rightOffset?: number;
};

export type FloatingVoiceButtonHandle = {
  startRecording: () => void;
};

export const FloatingVoiceButton = forwardRef<FloatingVoiceButtonHandle, FloatingVoiceButtonProps>(
  function FloatingVoiceButton({ onText, disabled = false, disabledMessage, rightOffset = 0 }, ref) {
  const location = useLocation();
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
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

  useImperativeHandle(ref, () => ({ startRecording: () => { void startRecording(); } }), [startRecording]);

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
              width: isBusy ? 240 : 34,
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
              <Waveform isActive={recordingState === "recording"} elapsedSeconds={elapsedSeconds} stream={streamRef.current} />
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
});

const BAR_COUNT = 12;
const IDLE_HEIGHTS = [12, 18, 9, 22, 14, 19, 10, 16, 21, 11, 17, 13];
// How many rAF frames between each scroll step (lower = faster scroll)
const SCROLL_INTERVAL_FRAMES = 5;

function Waveform({ isActive, elapsedSeconds, stream }: { isActive: boolean; elapsedSeconds: number; stream: MediaStream | null }) {
  const capped = Math.min(60, elapsedSeconds);
  const timeLabel = `0:${String(capped).padStart(2, "0")}`;
  const barEls = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  // Ring buffer holding the last BAR_COUNT amplitude samples
  const historyRef = useRef<number[]>(Array(BAR_COUNT).fill(5));
  const frameCountRef = useRef(0);

  useEffect(() => {
    if (!isActive || !stream) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    audioCtx.createMediaStreamSource(stream).connect(analyser);

    const timeData = new Uint8Array(analyser.fftSize);
    const history = historyRef.current;

    const tick = () => {
      frameCountRef.current += 1;

      // Sample overall RMS amplitude from the time-domain waveform
      analyser.getByteTimeDomainData(timeData);
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = ((timeData[i] ?? 128) - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / timeData.length);
      // Map rms (0–1, but typically 0–0.5 for speech) → bar height 5–27px
      const sample = 3 + Math.min(rms * 8, 1) * 24;

      // Push new sample into ring buffer every N frames (controls scroll speed)
      if (frameCountRef.current % SCROLL_INTERVAL_FRAMES === 0) {
        history.pop();
        history.unshift(sample);
      }

      // Write bar heights directly to DOM
      for (let i = 0; i < BAR_COUNT; i++) {
        const el = barEls.current[i];
        if (el) el.style.height = `${(history[i] ?? 5).toFixed(1)}px`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      analyser.disconnect();
      audioCtx.close().catch(() => {});
    };
  }, [isActive, stream]);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.45, flex: 1, pr: 3.5, pl: 3.5 }}>
      {isActive ? (
        <>
          {IDLE_HEIGHTS.map((idleHeight, index) => (
            <Box
              key={index}
              ref={(el) => { barEls.current[index] = el as HTMLDivElement | null; }}
              sx={{
                width: 3,
                height: idleHeight,
                borderRadius: 99,
                bgcolor: "success.main",
                opacity: 0.95 - (index / BAR_COUNT) * 0.35,
                transition: "height 80ms ease-out",
              }}
            />
          ))}
          <Box
            sx={{
              ml: 0.5,
              fontSize: 11,
              fontVariantNumeric: "tabular-nums",
              color: capped >= 50 ? "error.main" : "success.main",
              flexShrink: 0,
            }}
          >
            {timeLabel}
          </Box>
        </>
      ) : (
        IDLE_HEIGHTS.map((height, index) => (
          <Box
            key={index}
            sx={{
              width: 3,
              height,
              borderRadius: 99,
              bgcolor: "grey.300",
              opacity: 0.6,
              animation: "voice-wave 850ms ease-in-out infinite",
              animationDelay: `${index * 62}ms`,
              "@keyframes voice-wave": {
                "0%, 100%": { transform: "scaleY(0.45)" },
                "50%": { transform: "scaleY(1.15)" },
              },
            }}
          />
        ))
      )}
    </Box>
  );
}
