import { useCallback, useMemo, useRef } from "react";
import { Animated, PanResponder, Platform } from "react-native";

import { blurActiveElement } from "@/lib/accessibility/blurActiveElement";
import { dismissActiveKeyboard } from "@/lib/accessibility/dismissActiveKeyboard";

const DRAWER_EDGE_GESTURE_THRESHOLD_PX = 10;
const DRAWER_OPEN_VELOCITY_THRESHOLD = 0.5;
const DRAWER_OPEN_DISTANCE_RATIO = 0.25;
const DRAWER_CLOSE_DISTANCE_RATIO = 0.2;

type UseShellDrawerOptions = {
  drawerWidth: number;
  isNavOpen: boolean;
  onInteractionStart?: (() => void) | null;
  setNavOpen: (open: boolean) => void;
};

export function useShellDrawer({ drawerWidth, isNavOpen, onInteractionStart, setNavOpen }: UseShellDrawerOptions) {
  const drawerTranslateX = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const useAnimatedNativeDriver = Platform.OS !== "web";
  const handleInteractionStart = useCallback(() => {
    if (onInteractionStart) {
      onInteractionStart();
      return;
    }

    dismissActiveKeyboard();
  }, [onInteractionStart]);

  const dismissDrawer = useCallback(() => {
    handleInteractionStart();
    blurActiveElement();
    drawerTranslateX.stopAnimation();
    overlayOpacity.stopAnimation();
    drawerTranslateX.setValue(-drawerWidth);
    overlayOpacity.setValue(0);
    setNavOpen(false);
  }, [drawerTranslateX, drawerWidth, handleInteractionStart, overlayOpacity, setNavOpen]);

  const closeDrawer = useCallback(
    (onClosed?: () => void) => {
      handleInteractionStart();
      blurActiveElement();
      const onClosedCallback = typeof onClosed === "function" ? onClosed : null;
      if (!isNavOpen) {
        onClosedCallback?.();
        return;
      }

      Animated.parallel([
        Animated.timing(drawerTranslateX, {
          toValue: -drawerWidth,
          duration: 180,
          useNativeDriver: useAnimatedNativeDriver,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: useAnimatedNativeDriver,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setNavOpen(false);
          onClosedCallback?.();
        }
      });
    },
    [drawerTranslateX, drawerWidth, handleInteractionStart, isNavOpen, overlayOpacity, setNavOpen, useAnimatedNativeDriver],
  );

  const openDrawer = useCallback(() => {
    if (isNavOpen) {
      return;
    }

    handleInteractionStart();
    drawerTranslateX.setValue(-drawerWidth);
    overlayOpacity.setValue(0);
    setNavOpen(true);
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(drawerTranslateX, {
          toValue: 0,
          duration: 180,
          useNativeDriver: useAnimatedNativeDriver,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: useAnimatedNativeDriver,
        }),
      ]).start();
    });
  }, [drawerTranslateX, drawerWidth, handleInteractionStart, isNavOpen, overlayOpacity, setNavOpen, useAnimatedNativeDriver]);

  const edgePanResponder = useMemo(
    () =>
      PanResponder.create({
        onPanResponderTerminationRequest: () => false,
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          !isNavOpen &&
          gestureState.dx > DRAWER_EDGE_GESTURE_THRESHOLD_PX &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          !isNavOpen &&
          gestureState.dx > DRAWER_EDGE_GESTURE_THRESHOLD_PX &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
          handleInteractionStart();
          drawerTranslateX.setValue(-drawerWidth);
          overlayOpacity.setValue(0);
          setNavOpen(true);
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextTranslateX = Math.min(0, Math.max(-drawerWidth, -drawerWidth + gestureState.dx));
          drawerTranslateX.setValue(nextTranslateX);
          overlayOpacity.setValue(Math.min(1, Math.max(0, gestureState.dx / drawerWidth)));
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (
            gestureState.dx > drawerWidth * DRAWER_OPEN_DISTANCE_RATIO ||
            gestureState.vx > DRAWER_OPEN_VELOCITY_THRESHOLD
          ) {
            Animated.parallel([
              Animated.timing(drawerTranslateX, {
                toValue: 0,
                duration: 160,
                useNativeDriver: useAnimatedNativeDriver,
              }),
              Animated.timing(overlayOpacity, {
                toValue: 1,
                duration: 160,
                useNativeDriver: useAnimatedNativeDriver,
              }),
            ]).start();
            return;
          }

          Animated.parallel([
            Animated.timing(drawerTranslateX, {
              toValue: -drawerWidth,
              duration: 160,
              useNativeDriver: useAnimatedNativeDriver,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 0,
              duration: 160,
              useNativeDriver: useAnimatedNativeDriver,
            }),
          ]).start(({ finished }) => {
            if (finished) {
              setNavOpen(false);
            }
          });
        },
      }),
    [drawerTranslateX, drawerWidth, handleInteractionStart, isNavOpen, overlayOpacity, setNavOpen, useAnimatedNativeDriver],
  );

  const drawerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onPanResponderTerminationRequest: () => false,
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          isNavOpen &&
          gestureState.dx < -DRAWER_EDGE_GESTURE_THRESHOLD_PX &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          isNavOpen &&
          gestureState.dx < -DRAWER_EDGE_GESTURE_THRESHOLD_PX &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
          handleInteractionStart();
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextTranslateX = Math.min(0, Math.max(-drawerWidth, gestureState.dx));
          drawerTranslateX.setValue(nextTranslateX);
          overlayOpacity.setValue(Math.min(1, Math.max(0, 1 + gestureState.dx / drawerWidth)));
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (
            gestureState.dx < -drawerWidth * DRAWER_CLOSE_DISTANCE_RATIO ||
            gestureState.vx < -DRAWER_OPEN_VELOCITY_THRESHOLD
          ) {
            closeDrawer();
            return;
          }

          Animated.parallel([
            Animated.timing(drawerTranslateX, {
              toValue: 0,
              duration: 160,
              useNativeDriver: useAnimatedNativeDriver,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 1,
              duration: 160,
              useNativeDriver: useAnimatedNativeDriver,
            }),
          ]).start();
        },
      }),
    [closeDrawer, drawerTranslateX, drawerWidth, handleInteractionStart, isNavOpen, overlayOpacity, useAnimatedNativeDriver],
  );

  return {
    closeDrawer,
    dismissDrawer,
    drawerPanHandlers: drawerPanResponder.panHandlers,
    drawerTranslateX,
    edgePanHandlers: edgePanResponder.panHandlers,
    openDrawer,
    overlayOpacity,
  };
}
