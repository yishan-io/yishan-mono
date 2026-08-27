import { createYishanRuntime, installRuntimeShutdownHandlers } from "./runtime";
import { installYishanDshTestReplayAdapter, isYishanDshTestReplayEnabled } from "./testReplayAdapter";

const runtime = await createYishanRuntime();
if (isYishanDshTestReplayEnabled()) installYishanDshTestReplayAdapter(runtime.context);
installRuntimeShutdownHandlers(runtime);
