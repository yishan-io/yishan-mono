import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/features/auth";

export default function AppLayout() {
  const { status } = useAuth();

  if (status !== "authenticated") {
    return <Redirect href="/(public)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
