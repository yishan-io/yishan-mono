// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentChatVoiceButton } from "./AgentChatVoiceButton";

const mocked = vi.hoisted(() => {
  const state = {
    recordingState: "idle" as "idle" | "recording" | "ready" | "transcribing",
    errorMessage: null as string | null,
    elapsedSeconds: 0,
    activeStream: null as MediaStream | null,
  };

  return {
    state,
    startRecording: vi.fn(),
    cancelRecording: vi.fn(),
    handleSubmit: vi.fn(),
    setErrorMessage: vi.fn(),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "agentChat.voice.start": "Click to record voice input",
        "agentChat.voice.recording": "Recording voice input",
        "agentChat.voice.ready": "Voice input ready",
        "agentChat.voice.transcribing": "Transcribing voice",
        "agentChat.voice.transcribingProgress": "Transcribing...",
        "agentChat.voice.cancel": "Cancel voice input",
        "agentChat.voice.submit": "Submit voice input",
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock("./useVoiceRecording", () => ({
  useVoiceRecording: () => ({
    recordingState: mocked.state.recordingState,
    errorMessage: mocked.state.errorMessage,
    elapsedSeconds: mocked.state.elapsedSeconds,
    activeStream: mocked.state.activeStream,
    startRecording: mocked.startRecording,
    cancelRecording: mocked.cancelRecording,
    handleSubmit: mocked.handleSubmit,
    setErrorMessage: mocked.setErrorMessage,
  }),
}));

afterEach(() => {
  cleanup();
  mocked.state.recordingState = "idle";
  mocked.state.errorMessage = null;
  mocked.state.elapsedSeconds = 0;
  mocked.state.activeStream = null;
  vi.clearAllMocks();
});

describe("AgentChatVoiceButton", () => {
  it("renders the compact mic state when idle", () => {
    render(<AgentChatVoiceButton onText={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Click to record voice input" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel voice input" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit voice input" })).toBeNull();
  });

  it("renders the expanded recording controls while recording", () => {
    mocked.state.recordingState = "recording";
    mocked.state.elapsedSeconds = 7;

    render(<AgentChatVoiceButton onText={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Recording voice input" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel voice input" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit voice input" })).toBeTruthy();
    expect(screen.getByText("0:07")).toBeTruthy();
  });

  it("shows the ready state and preserves cancel/submit actions", () => {
    mocked.state.recordingState = "ready";
    mocked.state.elapsedSeconds = 12;

    render(<AgentChatVoiceButton onText={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Voice input ready" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel voice input" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit voice input" })).toBeTruthy();
    expect(screen.getByText("0:12")).toBeTruthy();
  });

  it("shows the transcribing state text", () => {
    mocked.state.recordingState = "transcribing";

    render(<AgentChatVoiceButton onText={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Transcribing voice" })).toBeTruthy();
    expect(screen.getByText("Transcribing...")).toBeTruthy();
  });
});
