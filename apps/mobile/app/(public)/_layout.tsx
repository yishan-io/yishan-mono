import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/features/auth";

export default function PublicLayout() {
  const { status } = useAuth();

  if (status === "authenticated") {
    return <Redirect href="/(app)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
