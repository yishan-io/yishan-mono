import { Redirect } from "expo-router";

import { useAuth } from "@/features/auth";

export default function IndexScreen() {
  const { status } = useAuth();

  if (status === "authenticated") {
    return <Redirect href="/(app)" />;
  }

  return <Redirect href="/(public)" />;
}
