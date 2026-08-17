const RUNTIME_ROOT_TEST_ID = "workspace-runtime-root";

let runtimeRoot: HTMLDivElement | null = null;

export function getOrCreateRuntimeRoot(): HTMLDivElement {
  if (runtimeRoot?.isConnected) {
    return runtimeRoot;
  }

  const existing = document.querySelector<HTMLDivElement>(`[data-testid="${RUNTIME_ROOT_TEST_ID}"]`);
  if (existing) {
    runtimeRoot = existing;
    return existing;
  }

  const root = document.createElement("div");
  root.setAttribute("data-testid", RUNTIME_ROOT_TEST_ID);
  root.style.position = "fixed";
  root.style.left = "0";
  root.style.top = "0";
  root.style.width = "0";
  root.style.height = "0";
  root.style.pointerEvents = "none";
  root.style.zIndex = "0";
  document.body.appendChild(root);
  runtimeRoot = root;
  return root;
}
