import { useQuery } from "@tanstack/react-query";
import { getRemoteHealthStatus } from "../../features/session/commands/sessionCommands";

/** Tracks remote api-service reachability for login-screen diagnostics. */
export function useRemoteHealthQuery() {
  return useQuery({
    queryKey: ["remote-health"],
    queryFn: getRemoteHealthStatus,
    staleTime: 30_000,
    retry: 1,
  });
}
