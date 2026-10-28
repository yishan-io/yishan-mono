import { createStore } from "zustand/vanilla";

interface ProjectMutationStoreState {
  revision: number;
  activeCount: number;
  begin: () => void;
  finish: () => void;
}

// Runtime coordination only: never persist this fence or expose its mutable state.
const projectMutationStore = createStore<ProjectMutationStoreState>((set) => ({
  revision: 0,
  activeCount: 0,
  begin: () => set((state) => ({ revision: state.revision + 1, activeCount: state.activeCount + 1 })),
  finish: () => set((state) => ({ activeCount: state.activeCount - 1 })),
}));

/** Begins a project mutation; the caller must release it exactly once in finally. */
export function beginProjectMutation(): () => void {
  projectMutationStore.getState().begin();
  return projectMutationStore.getState().finish;
}

/** Captures a snapshot fence that stays invalid if it starts during, or crosses, a mutation. */
export function captureProjectSnapshotFence(): () => boolean {
  const { revision, activeCount } = projectMutationStore.getState();
  return () => {
    const current = projectMutationStore.getState();
    return activeCount === 0 && current.activeCount === 0 && current.revision === revision;
  };
}
