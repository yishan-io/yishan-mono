export interface MemorySearchInput {
  query: string;
  projectId?: string;
  scope?: "project" | "global";
  limit?: number;
}

export interface MemorySearchResult {
  path: string;
  snippet: string;
  score: number;
}

export interface MemoryReconcileResult {
  status: string;
}

export interface MemoryBackendClient {
  search(input: MemorySearchInput): Promise<MemorySearchResult[]>;
  reconcile(): Promise<MemoryReconcileResult>;
}
