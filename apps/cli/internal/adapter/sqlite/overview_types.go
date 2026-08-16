package db

// ─── Token Usage ────────────────────────────────────────────────────────────────

// OverviewTokenUsageSeriesItem is one bucket in a token usage time series.
type OverviewTokenUsageSeriesItem struct {
	BucketStartUtc    string  `json:"bucketStartUtc"`
	TotalTokens       int64   `json:"totalTokens"`
	InputTokens       int64   `json:"inputTokens"`
	OutputTokens      int64   `json:"outputTokens"`
	CachedInputTokens int64   `json:"cachedInputTokens"`
	CachedWriteTokens int64   `json:"cachedWriteTokens"`
	TurnCount         int64   `json:"turnCount"`
	ToolCallCount     int64   `json:"toolCallCount"`
	TotalCostUSD      float64 `json:"totalCostUsd"`
}

// OverviewTokenUsageResult is the full token usage chart response.
type OverviewTokenUsageResult struct {
	Series           []OverviewTokenUsageSeriesItem `json:"series"`
	CachedTotal      int64                          `json:"cachedTotal"`
	CachedWriteTotal int64                          `json:"cachedWriteTotal"`
	UncachedTotal    int64                          `json:"uncachedTotal"`
	GrandTotal       int64                          `json:"grandTotal"`
	TurnTotal        int64                          `json:"turnTotal"`
	ToolCallTotal    int64                          `json:"toolCallTotal"`
	TotalCostUSD     float64                        `json:"totalCostUsd"`
}

// ─── Model Breakdown ────────────────────────────────────────────────────────────

// OverviewModelBreakdownItem is one model in the model breakdown.
type OverviewModelBreakdownItem struct {
	ModelNormalized string  `json:"modelNormalized"`
	AgentKind       string  `json:"agentKind"`
	TotalTokens     int64   `json:"totalTokens"`
	InputTokens     int64   `json:"inputTokens"`
	OutputTokens    int64   `json:"outputTokens"`
	TotalCostUSD    float64 `json:"totalCostUsd"`
	Percentage      float64 `json:"percentage"`
}

// OverviewModelBreakdownResult is the model breakdown response.
type OverviewModelBreakdownResult struct {
	Models []OverviewModelBreakdownItem `json:"models"`
}

// ─── Agent Kind Breakdown ───────────────────────────────────────────────────────

// OverviewAgentKindBreakdownItem is one agent kind in the breakdown.
type OverviewAgentKindBreakdownItem struct {
	AgentKind    string  `json:"agentKind"`
	TotalTokens  int64   `json:"totalTokens"`
	InputTokens  int64   `json:"inputTokens"`
	OutputTokens int64   `json:"outputTokens"`
	Percentage   float64 `json:"percentage"`
}

// OverviewAgentKindBreakdownResult is the agent kind breakdown response.
type OverviewAgentKindBreakdownResult struct {
	AgentKinds []OverviewAgentKindBreakdownItem `json:"agentKinds"`
}

// ─── Workspace Insights ─────────────────────────────────────────────────────────

// OverviewClosedWorkspaceItem is one closed workspace in the insights list.
type OverviewClosedWorkspaceItem struct {
	ID            string  `json:"id"`
	ProjectID     string  `json:"projectId"`
	ProjectName   string  `json:"projectName"`
	Branch        *string `json:"branch"`
	CreatedAt     string  `json:"createdAt"`
	ClosedAt      string  `json:"closedAt"`
	LifetimeHours float64 `json:"lifetimeHours"`
	TotalTokens   int64   `json:"totalTokens"`
	TotalCostUSD  float64 `json:"totalCostUsd"`
}

// OverviewPrimaryWorkspaceItem is one primary workspace in the insights list.
type OverviewPrimaryWorkspaceItem struct {
	ID           string  `json:"id"`
	ProjectID    string  `json:"projectId"`
	ProjectName  string  `json:"projectName"`
	Branch       *string `json:"branch"`
	CreatedAt    string  `json:"createdAt"`
	TotalTokens  int64   `json:"totalTokens"`
	TotalCostUSD float64 `json:"totalCostUsd"`
}

// OverviewWorkspaceInsightsResult is the workspace insights response.
type OverviewWorkspaceInsightsResult struct {
	ClosedWorkspaceCount   int                            `json:"closedWorkspaceCount"`
	AverageLifetimeHours   *float64                       `json:"averageLifetimeHours"`
	LastClosedWorkspaces   []OverviewClosedWorkspaceItem  `json:"lastClosedWorkspaces"`
	PrimaryWorkspaceCount  int                            `json:"primaryWorkspaceCount"`
	PrimaryWorkspaceTokens int64                          `json:"primaryWorkspaceTokens"`
	TopPrimaryWorkspaces   []OverviewPrimaryWorkspaceItem `json:"topPrimaryWorkspaces"`
}
