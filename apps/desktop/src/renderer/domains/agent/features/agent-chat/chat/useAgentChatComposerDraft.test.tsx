// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { sendAgentPrompt } from "../../../commands/agentChatCommands";
import { agentChatStore } from "../../../state/agentChatStore";
import { ComposerAttachmentBlock } from "./composer/ComposerAttachmentBlock";
import { useAgentChatComposerDraft } from "./useAgentChatComposerDraft";

vi.mock("../../../commands/agentChatCommands", () => ({
  sendAgentPrompt: vi.fn(),
  abortAgent: vi.fn(),
  compactAgent: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const input = {
  tabId: "image-tab",
  workspaceId: "workspace",
  sessionId: "session",
  sessionState: "idle",
  messageCount: 1,
  hasStreamingMessage: false,
  userRenamed: false,
  slashCommands: [],
};

it("blocks pending reads, previews/removes images, sends image-only raw data and retains failed sends", async () => {
  const { result } = renderHook(() => useAgentChatComposerDraft(input));
  act(() => result.current.handleImagesPaste([new File(["image"], "clip.png", { type: "image/png" })]));
  await act(async () => {
    expect(await result.current.handleSubmit("")).toBe(false);
  });
  expect(sendAgentPrompt).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.attachments[0]).toMatchObject({ data: "aW1hZ2U=" }));
  const attachment = result.current.attachments[0];
  if (!attachment) throw new Error("Missing image attachment");
  const onRemove = vi.fn();
  render(<ComposerAttachmentBlock attachment={attachment} onRemove={onRemove} />);
  expect(screen.getByRole("img").getAttribute("src")).toBe("data:image/png;base64,aW1hZ2U=");
  fireEvent.click(screen.getByRole("button", { name: "Remove image attachment" }));
  expect(onRemove).toHaveBeenCalledWith(attachment.id);
  vi.mocked(sendAgentPrompt).mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    expect(await result.current.handleSubmit("")).toBe(false);
  });
  expect(result.current.attachments).toHaveLength(1);
  vi.mocked(sendAgentPrompt).mockResolvedValueOnce(undefined);
  await act(async () => {
    expect(await result.current.handleSubmit("")).toBe(true);
  });
  expect(sendAgentPrompt).toHaveBeenLastCalledWith({
    tabId: "image-tab",
    sessionId: "session",
    message: "",
    images: [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }],
  });
  expect(result.current.attachments).toHaveLength(0);
});

it("surfaces read errors and blocks sending instead of dropping the image", async () => {
  agentChatStore.getState().initSession("image-tab", "session");
  vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
    this.dispatchEvent(new ProgressEvent("error"));
  });
  const { result } = renderHook(() => useAgentChatComposerDraft(input));
  act(() => result.current.handleImagesPaste([new File(["image"], "bad.png", { type: "image/png" })]));
  await waitFor(() => expect(result.current.attachments[0]).toMatchObject({ error: expect.stringContaining("read") }));
  await act(async () => {
    expect(await result.current.handleSubmit("hello")).toBe(false);
  });
  expect(agentChatStore.getState().sessionsByTabId["image-tab"]?.turnError).toBeTruthy();
  const failed = result.current.attachments[0];
  if (!failed) throw new Error("Missing failed attachment");
  act(() => result.current.handleRemoveAttachment(failed.id));
  expect(result.current.attachments).toHaveLength(0);
});


it("cancels a removed pending image and allows text submit without stale read errors", async () => {
  agentChatStore.getState().initSession("image-tab", "session");
  let pending: FileReader | undefined;
  vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) { pending = this; });
  const abort = vi.spyOn(FileReader.prototype, "abort");
  const { result } = renderHook(() => useAgentChatComposerDraft(input));
  act(() => result.current.handleImagesPaste([new File(["image"], "pending.png", { type: "image/png" })]));
  const id = result.current.attachments[0]?.id;
  if (!id || !pending) throw new Error("Missing pending image");
  const staleError = pending.onerror;
  act(() => result.current.handleRemoveAttachment(id));
  expect(abort).toHaveBeenCalledOnce();
  vi.mocked(sendAgentPrompt).mockResolvedValueOnce(undefined);
  await act(async () => { expect(await result.current.handleSubmit("hello")).toBe(true); });
  pending.addEventListener("error", function (event) { staleError?.call(this, event); });
  act(() => { pending?.dispatchEvent(new ProgressEvent("error")); });
  expect(result.current.attachments).toEqual([]);
  expect(agentChatStore.getState().sessionsByTabId["image-tab"]?.turnError).toBeFalsy();
});

it("aborts pending readers on unmount and ignores late callbacks", () => {
  agentChatStore.getState().initSession("image-tab", "session");
  const readers: FileReader[] = [];
  vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) { readers.push(this); });
  const abort = vi.spyOn(FileReader.prototype, "abort");
  const { result, unmount } = renderHook(() => useAgentChatComposerDraft(input));
  act(() => result.current.handleImagesPaste([new File(["image"], "pending.png", { type: "image/png" })]));
  const reader = readers[0];
  if (!reader) throw new Error("Missing reader");
  const staleError = reader.onerror;
  unmount();
  expect(abort).toHaveBeenCalledOnce();
  reader.addEventListener("error", function (event) { staleError?.call(this, event); });
  act(() => { reader.dispatchEvent(new ProgressEvent("error")); });
  expect(agentChatStore.getState().sessionsByTabId["image-tab"]?.turnError).toBeFalsy();
});
