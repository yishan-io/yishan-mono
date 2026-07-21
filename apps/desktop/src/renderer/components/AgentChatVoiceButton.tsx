import { Box, IconButton, Tooltip } from "@mui/material";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowUp, LuLoaderCircle, LuMic, LuX } from "react-icons/lu";
import { useVoiceRecording } from "./useVoiceRecording";

type AgentChatVoiceButtonProps = {
  onText: (text: string) => Promise<void> | void;
  disabled?: boolean;
  disabledMessage?: string;
};

export function AgentChatVoiceButton({ onText, disabled = false, disabledMessage }: AgentChatVoiceButtonProps) {
  const { t } = useTranslation();
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

  const isBusy = recordingState !== "idle";
  const label =
    recordingState === "recording"
      ? t("agentChat.voice.recording")
      : recordingState === "ready"
        ? t("agentChat.voice.ready")
        : recordingState === "transcribing"
          ? t("agentChat.voice.transcribing")
          : t("agentChat.voice.start");
  const title = recordingState === "idle" ? (disabled ? (disabledMessage ?? label) : label) : (errorMessage ?? label);

  const handleClick = useCallback(() => {
    setErrorMessage(null);
    void startRecording();
  }, [setErrorMessage, startRecording]);

  return (
    <Tooltip title={title} placement="top">
      <span>
        <Box
          sx={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            width: isBusy ? 240 : 34,
            height: 34,
            flexShrink: 0,
            justifyContent: isBusy ? "flex-start" : "center",
          }}
        >
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
              color: (theme) => (isBusy ? "common.white" : theme.palette.text.secondary),
              bgcolor: (theme) =>
                isBusy
                  ? recordingState === "recording"
                    ? "success.main"
                    : theme.palette.mode === "dark"
                      ? "background.paper"
                      : theme.palette.primary.main
                  : "transparent",
              border: isBusy ? "1px solid" : "1px solid transparent",
              borderColor: (theme) =>
                isBusy
                  ? recordingState === "recording"
                    ? "success.main"
                    : theme.palette.mode === "dark"
                      ? "divider"
                      : theme.palette.primary.main
                  : "transparent",
              boxShadow: isBusy ? 1 : 0,
              borderRadius: 999,
              transition: "width 160ms ease, background-color 120ms ease, border-color 120ms ease",
              "&:hover": {
                bgcolor: (theme) =>
                  isBusy
                    ? recordingState === "recording"
                      ? "success.dark"
                      : theme.palette.mode === "dark"
                        ? "action.hover"
                        : theme.palette.primary.dark
                    : theme.palette.action.hover,
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
              <LuLoaderCircle className="voice-spin-icon" color="currentColor" size={16} />
            ) : !isBusy ? (
              <LuMic size={16} />
            ) : null}
            {recordingState === "transcribing" ? (
              <Box
                sx={{
                  flex: 1,
                  pr: 3.5,
                  pl: 1,
                  fontSize: 12,
                  color: (theme) => (theme.palette.mode === "dark" ? "common.white" : "text.secondary"),
                  textAlign: "left",
                }}
              >
                {t("agentChat.voice.transcribingProgress")}
              </Box>
            ) : isBusy ? (
              <Waveform
                isActive={recordingState === "recording"}
                elapsedSeconds={elapsedSeconds}
                stream={activeStream}
              />
            ) : null}
          </IconButton>
          {recordingState === "recording" || recordingState === "ready" ? (
            <Tooltip title={t("agentChat.voice.cancel")} placement="top">
              <IconButton
                aria-label={t("agentChat.voice.cancel")}
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
                  color: (theme) => (theme.palette.mode === "dark" ? "common.white" : theme.palette.error.contrastText),
                  bgcolor: (theme) => (theme.palette.mode === "dark" ? "background.paper" : theme.palette.error.main),
                  border: "1px solid",
                  borderColor: (theme) => (theme.palette.mode === "dark" ? "divider" : theme.palette.error.main),
                  boxShadow: 1,
                  "&:hover": {
                    bgcolor: (theme) => (theme.palette.mode === "dark" ? "action.hover" : theme.palette.error.dark),
                  },
                }}
              >
                <LuX size={16} />
              </IconButton>
            </Tooltip>
          ) : null}
          {recordingState === "recording" || recordingState === "ready" ? (
            <Tooltip title={t("agentChat.voice.submit")} placement="top">
              <IconButton
                aria-label={t("agentChat.voice.submit")}
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
                  color: (theme) =>
                    theme.palette.mode === "dark" ? "common.white" : theme.palette.primary.contrastText,
                  bgcolor: (theme) => (theme.palette.mode === "dark" ? "background.paper" : theme.palette.primary.main),
                  border: "1px solid",
                  borderColor: (theme) => (theme.palette.mode === "dark" ? "divider" : theme.palette.primary.main),
                  boxShadow: 1,
                  "&:hover": {
                    bgcolor: (theme) => (theme.palette.mode === "dark" ? "action.hover" : theme.palette.primary.dark),
                  },
                }}
              >
                <LuArrowUp size={16} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
      </span>
    </Tooltip>
  );
}

const BAR_COUNT = 16;
const BAR_KEYS = [
  "bar-1",
  "bar-2",
  "bar-3",
  "bar-4",
  "bar-5",
  "bar-6",
  "bar-7",
  "bar-8",
  "bar-9",
  "bar-10",
  "bar-11",
  "bar-12",
  "bar-13",
  "bar-14",
  "bar-15",
  "bar-16",
] as const;
const IDLE_HEIGHTS = [12, 18, 9, 22, 14, 19, 10, 16, 21, 11, 17, 13, 15, 20, 12, 18];
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
        const bar = barEls.current[i];
        if (!bar) continue;

        const height = isActive ? (history[i] ?? 5) : (IDLE_HEIGHTS[i] ?? 5);
        bar.style.height = `${height}px`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      audioCtx.close().catch(() => {});
    };
  }, [isActive, stream]);

  return (
    <Box
      sx={{
        flex: 1,
        pl: 4.5,
        pr: 6,
        height: 18,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, minWidth: 0, flex: 1 }}>
        {BAR_KEYS.map((key, index) => (
          <Box
            key={key}
            ref={(node: HTMLDivElement | null) => {
              barEls.current[index] = node;
            }}
            sx={{
              width: 2,
              height: isActive ? 12 : (IDLE_HEIGHTS[index] ?? 5),
              borderRadius: 99,
              bgcolor: (theme) =>
                isActive
                  ? theme.palette.mode === "dark"
                    ? "rgba(255, 255, 255, 0.88)"
                    : "rgba(25, 32, 44, 0.88)"
                  : theme.palette.mode === "dark"
                    ? "rgba(255, 255, 255, 0.72)"
                    : "rgba(25, 32, 44, 0.72)",
              transition: "height 80ms linear",
              flex: "0 0 auto",
            }}
          />
        ))}
      </Box>
      <Box
        sx={{
          width: 38,
          textAlign: "right",
          fontSize: 12,
          color: (theme) => (theme.palette.mode === "dark" ? "grey.100" : "text.secondary"),
          flex: "0 0 auto",
        }}
      >
        {timeLabel}
      </Box>
    </Box>
  );
}
