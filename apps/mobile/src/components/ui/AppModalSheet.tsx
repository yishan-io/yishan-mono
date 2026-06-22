import type { PropsWithChildren, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Sheet, useTheme } from "tamagui";

import { blurActiveElement } from "@/lib/accessibility/blurActiveElement";
import { MOBILE_UI_TOKENS } from "./ui-tokens";

export const APP_MODAL_SHEET_CLOSE_ANIMATION_MS = 240;

type AppModalSheetProps = PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  animationType?: "fade" | "slide" | "none";
  position?: "bottom" | "center";
  keyboardAvoiding?: boolean;
  showHandle?: boolean;
  contentStyle?: ViewStyle;
  headerRight?: ReactNode;
  initialSnapPointIndex?: number;
  snapPoints?: number[];
  snapPointsMode?: "fit" | "percent" | "constant" | "mixed";
}>;

/** Owns the shared mobile modal/sheet shell for bottom-sheet and centered-dialog presentation. */
export function AppModalSheet({
  animationType,
  children,
  contentStyle,
  headerRight,
  initialSnapPointIndex = 0,
  keyboardAvoiding = false,
  onClose,
  open,
  position = "bottom",
  snapPoints,
  snapPointsMode,
  showHandle = false,
}: AppModalSheetProps) {
  const theme = useTheme();
  const isBottomSheet = position === "bottom";
  const resolvedAnimationType = animationType ?? (isBottomSheet ? "slide" : "fade");
  const [isBottomSheetMounted, setBottomSheetMounted] = useState(open);
  const [sheetEpoch, setSheetEpoch] = useState(0);
  const closeUnmountTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpenRef = useRef(open);
  const handleClose = () => {
    blurActiveElement();
    onClose();
  };

  useEffect(() => {
    if (!isBottomSheet) {
      wasOpenRef.current = open;
      return;
    }

    if (closeUnmountTimeoutRef.current) {
      clearTimeout(closeUnmountTimeoutRef.current);
      closeUnmountTimeoutRef.current = null;
    }

    if (open) {
      setBottomSheetMounted(true);
      if (!wasOpenRef.current) {
        setSheetEpoch((current) => current + 1);
      }
    } else {
      closeUnmountTimeoutRef.current = setTimeout(() => {
        setBottomSheetMounted(false);
        closeUnmountTimeoutRef.current = null;
      }, APP_MODAL_SHEET_CLOSE_ANIMATION_MS);
    }

    wasOpenRef.current = open;
    return () => {
      if (closeUnmountTimeoutRef.current) {
        clearTimeout(closeUnmountTimeoutRef.current);
        closeUnmountTimeoutRef.current = null;
      }
    };
  }, [isBottomSheet, open]);

  if (isBottomSheet) {
    if (!isBottomSheetMounted) {
      return null;
    }

    return (
      <Sheet
        key={`bottom-sheet-${sheetEpoch}`}
        animation="medium"
        dismissOnOverlayPress
        dismissOnSnapToBottom
        modal
        onOpenChange={(nextOpen: boolean) => {
          if (!nextOpen) {
            handleClose();
          }
        }}
        open={open}
        position={initialSnapPointIndex}
        snapPoints={snapPoints}
        snapPointsMode={snapPointsMode ?? (snapPoints ? "percent" : "fit")}
      >
        <Sheet.Overlay
          animation="medium"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          onPress={handleClose}
          style={{ backgroundColor: MOBILE_UI_TOKENS.sheet.backdrop }}
        />
        <Sheet.Handle
          opacity={showHandle ? 1 : 0}
          pointerEvents={showHandle ? "auto" : "none"}
          style={showHandle ? undefined : styles.hiddenBottomSheetHandle}
        />
        <Sheet.Frame
          animation="medium"
          enterStyle={{ opacity: 0, y: 32 }}
          exitStyle={{ opacity: 0, y: 32 }}
          style={[styles.bottomSheet, styles.bottomSheetFrame, { backgroundColor: theme.background.val }, contentStyle]}
        >
          {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
          {children}
        </Sheet.Frame>
      </Sheet>
    );
  }

  const content = (
    <>
      <Pressable onPress={handleClose} style={styles.backdrop} />
      <View style={[styles.sheet, styles.centerSheet, { backgroundColor: theme.background.val }, contentStyle]}>
        {showHandle ? (
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: theme.borderColor.val }]} />
          </View>
        ) : null}
        {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
        {children}
      </View>
    </>
  );

  return (
    <Modal transparent visible={open} animationType={resolvedAnimationType} onRequestClose={handleClose}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.frame, styles.frameCenter]}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        <View style={[styles.frame, styles.frameCenter]}>{content}</View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: MOBILE_UI_TOKENS.sheet.backdrop,
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  bottomSheetFrame: {
    gap: 16,
    overflow: "hidden",
    padding: 20,
    width: "100%",
  },
  centerSheet: {
    borderRadius: 24,
  },
  frame: {
    flex: 1,
  },
  frameCenter: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  handle: {
    borderRadius: 999,
    height: 5,
    width: 44,
  },
  handleWrap: {
    alignItems: "center",
  },
  hiddenBottomSheetHandle: {
    display: "none",
  },
  headerRight: {
    alignItems: "flex-end",
  },
  sheet: {
    gap: 16,
    overflow: "hidden",
    padding: 20,
    width: "100%",
  },
});
