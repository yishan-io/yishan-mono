import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/features/auth";

export default function AppLayout() {
  const { status } = useAuth();

  if (status !== "authenticated") {
    return <Redirect href="/(public)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="organizations/[orgId]/index" options={{ animation: "none", headerShown: false }} />
      <Stack.Screen name="profile" options={{ animation: "slide_from_right", headerShown: false }} />
      <Stack.Screen name="shell/index" options={{ animation: "none", headerShown: false }} />
      <Stack.Screen name="shell/files" options={{ animation: "slide_from_right", headerShown: false }} />
      <Stack.Screen name="settings" options={{ animation: "none", headerShown: false }} />
    </Stack>
  );
}
