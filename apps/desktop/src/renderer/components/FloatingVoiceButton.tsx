import { Box, IconButton, Tooltip } from "@mui/material";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuArrowUp, LuLoaderCircle, LuMic, LuX } from "react-icons/lu";
import { useLocation } from "react-router-dom";
import { VOICE_RECORDING_VISIBILITY_EVENT } from "../views/workspace/RightPane/RightPaneTabBar";
import { useVoiceRecording } from "./useVoiceRecording";

type FloatingVoiceButtonProps = {
  onText: (text: string) => Promise<void> | void;
  disabled?: boolean;
  disabledMessage?: string;
  rightOffset?: number;
  /** When true, hides the idle mic button — only shows the expanded recording UI when active. */
  hideIdleButton?: boolean;
};

export type FloatingVoiceButtonHandle = {
  startRecording: () => void;
};

export const FloatingVoiceButton = forwardRef<FloatingVoiceButtonHandle, FloatingVoiceButtonProps>(
  function FloatingVoiceButton(
    { onText, disabled = false, disabledMessage, rightOffset = 0, hideIdleButton = false },
    ref,
  ) {
    const location = useLocation();
    const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

    const {
      recordingState,
      errorMessage,
      elapsedSeconds,
      activeStream,
      startRecording,
      cancelRecording,
      handleSubmit,
      setErrorMessage,
    } = useVoiceRecording({ onText, disabled, disabledMessage });

    useEffect(() => {
      setPortalHost(document.body);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        startRecording: () => {
          void startRecording();
        },
      }),
      [startRecording],
    );

    const handleClick = () => {
      setErrorMessage(null);
      void startRecording();
    };

    const isBusy = recordingState !== "idle";
    useEffect(() => {
      window.dispatchEvent(
        new CustomEvent(VOICE_RECORDING_VISIBILITY_EVENT, {
          detail: { visible: isBusy },
        }),
      );

      return () => {
        window.dispatchEvent(
          new CustomEvent(VOICE_RECORDING_VISIBILITY_EVENT, {
            detail: { visible: false },
          }),
        );
      };
    }, [isBusy]);

    const label =
      recordingState === "recording"
        ? "Recording voice input"
        : recordingState === "ready"
          ? "Voice input ready"
          : recordingState === "transcribing"
            ? "Transcribing voice"
            : "Click to record voice input";

    const button = (
      <Box sx={{ position: "fixed", right: 58 + rightOffset, bottom: 18, zIndex: 9 }}>
        <Tooltip
          title={recordingState === "idle" ? (disabled ? (disabledMessage ?? label) : label) : (errorMessage ?? label)}
          placement="left"
        >
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
              ) : !isBusy ? (
                <LuMic size={16} />
              ) : null}
              {recordingState === "transcribing" ? (
                <Box sx={{ flex: 1, pr: 3.5, pl: 1, fontSize: 12, color: "grey.100", textAlign: "left" }}>
                  Transcribing...
                </Box>
              ) : isBusy ? (
                <Waveform
                  isActive={recordingState === "recording"}
                  elapsedSeconds={elapsedSeconds}
                  stream={activeStream}
                />
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

    if (hideIdleButton && !isBusy) {
      return null;
    }

    return portalHost ? createPortal(button, portalHost) : null;
  },
);

const BAR_COUNT = 12;
const IDLE_HEIGHTS = [12, 18, 9, 22, 14, 19, 10, 16, 21, 11, 17, 13];
// How many rAF frames between each scroll step (lower = faster scroll)
const SCROLL_INTERVAL_FRAMES = 5;

function Waveform({
  isActive,
  elapsedSeconds,
  stream,
}: { isActive: boolean; elapsedSeconds: number; stream: MediaStream | null }) {
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
              key={idleHeight}
              ref={(el) => {
                barEls.current[index] = el as HTMLDivElement | null;
              }}
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
            key={height}
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
