import { Box, IconButton, Tooltip } from "@mui/material";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowUp, LuLoaderCircle, LuMic, LuX } from "react-icons/lu";
import { Waveform } from "./VoiceWaveform";
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
