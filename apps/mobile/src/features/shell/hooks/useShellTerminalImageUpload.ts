import { APP_MODAL_SHEET_CLOSE_ANIMATION_MS } from "@/components/ui/AppModalSheet";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth";
import { writeRelayWorkspaceFile } from "@/features/workspaces/workspaces.relay";
import { type TerminalUploadImageSource, pickTerminalUploadImage } from "../domain/shell-terminal-native-upload-domain";
import { buildTerminalInsertedImagePath } from "../domain/shell-terminal-upload-domain";
import type { TerminalItem } from "../state/shell.types";

type UseShellTerminalImageUploadInput = {
  onDismissKeyboard: () => void;
  onFocusKeyboard: () => void;
  onTerminalInput: (data: string) => void;
  selectedTerminal: TerminalItem;
  workspaceLocalPath?: string | null;
};

export function useShellTerminalImageUpload({
  onDismissKeyboard,
  onFocusKeyboard,
  onTerminalInput,
  selectedTerminal,
  workspaceLocalPath,
}: UseShellTerminalImageUploadInput) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const imageUploadSheetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [imageUploadSheetOpen, setImageUploadSheetOpen] = useState(false);

  const insertTerminalImagePath = async (pickedImage: {
    base64Data: string;
    fileName: string;
    mimeType: string;
  }) => {
    const accessToken = session?.accessToken;
    const nodeId = selectedTerminal.nodeId?.trim() ?? "";
    const normalizedWorkspaceLocalPath = workspaceLocalPath?.trim() ?? "";
    if (!accessToken || !nodeId || !normalizedWorkspaceLocalPath) {
      return;
    }

    const insertedImagePath = buildTerminalInsertedImagePath({
      fileName: pickedImage.fileName,
      mimeType: pickedImage.mimeType,
      workspaceLocalPath: normalizedWorkspaceLocalPath,
    });
    await writeRelayWorkspaceFile({
      accessToken,
      content: pickedImage.base64Data,
      encoding: "base64",
      nodeId,
      path: insertedImagePath.relativePath,
      workspaceId: selectedTerminal.workspaceId,
    });
    await queryClient.invalidateQueries({
      queryKey: [
        "organizations",
        selectedTerminal.orgId,
        "projects",
        selectedTerminal.projectId,
        "workspaces",
        selectedTerminal.workspaceId,
        "nodes",
        nodeId,
      ],
    });

    onTerminalInput(insertedImagePath.shellInput);
    onFocusKeyboard();
  };

  const pickAndInsertImagePath = async (source: TerminalUploadImageSource) => {
    const pickedImage = await pickTerminalUploadImage(source);
    if (!pickedImage) {
      return;
    }

    await insertTerminalImagePath(pickedImage);
  };

  const openImageUploadSheet = () => {
    onDismissKeyboard();
    setImageUploadSheetOpen(true);
  };

  const closeImageUploadSheet = () => {
    setImageUploadSheetOpen(false);
  };

  const handleImageUploadAction = (source: TerminalUploadImageSource) => {
    closeImageUploadSheet();
    if (imageUploadSheetTimeoutRef.current) {
      clearTimeout(imageUploadSheetTimeoutRef.current);
    }

    imageUploadSheetTimeoutRef.current = setTimeout(() => {
      imageUploadSheetTimeoutRef.current = null;
      void pickAndInsertImagePath(source);
    }, APP_MODAL_SHEET_CLOSE_ANIMATION_MS);
  };

  useEffect(
    () => () => {
      if (imageUploadSheetTimeoutRef.current) {
        clearTimeout(imageUploadSheetTimeoutRef.current);
        imageUploadSheetTimeoutRef.current = null;
      }
    },
    [],
  );

  return {
    closeImageUploadSheet,
    handleImageUploadAction,
    imageUploadSheetOpen,
    openImageUploadSheet,
  };
}
