import { useCallback, useMemo, useRef } from "react";
import { Animated, PanResponder, Platform } from "react-native";

import { blurActiveElement } from "@/lib/accessibility/blurActiveElement";

const DRAWER_EDGE_GESTURE_THRESHOLD_PX = 10;
const DRAWER_OPEN_VELOCITY_THRESHOLD = 0.5;
const DRAWER_OPEN_DISTANCE_RATIO = 0.25;
const DRAWER_CLOSE_DISTANCE_RATIO = 0.2;

type UseShellDrawerOptions = {
  drawerWidth: number;
  isNavOpen: boolean;
  setNavOpen: (open: boolean) => void;
};

export function useShellDrawer({ drawerWidth, isNavOpen, setNavOpen }: UseShellDrawerOptions) {
  const drawerTranslateX = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const useAnimatedNativeDriver = Platform.OS !== "web";

  const dismissDrawer = useCallback(() => {
    blurActiveElement();
    drawerTranslateX.stopAnimation();
    overlayOpacity.stopAnimation();
    drawerTranslateX.setValue(-drawerWidth);
    overlayOpacity.setValue(0);
    setNavOpen(false);
  }, [drawerTranslateX, drawerWidth, overlayOpacity, setNavOpen]);

  const closeDrawer = useCallback(
    (onClosed?: () => void) => {
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
    [drawerTranslateX, drawerWidth, isNavOpen, overlayOpacity, setNavOpen, useAnimatedNativeDriver],
  );

  const openDrawer = useCallback(() => {
    if (isNavOpen) {
      return;
    }

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
  }, [drawerTranslateX, drawerWidth, isNavOpen, overlayOpacity, setNavOpen, useAnimatedNativeDriver]);

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
    [drawerTranslateX, drawerWidth, isNavOpen, overlayOpacity, setNavOpen, useAnimatedNativeDriver],
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
    [closeDrawer, drawerTranslateX, drawerWidth, isNavOpen, overlayOpacity, useAnimatedNativeDriver],
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
