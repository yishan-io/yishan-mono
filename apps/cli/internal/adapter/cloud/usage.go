package cloud

import "fmt"

// Token-usage endpoints and their row DTOs.

type ListTokenUsageHourlyInput struct {
	ProjectID   string
	WorkspaceID string
	AgentKind   string
	From        string
	To          string
	Limit       int
}

type TokenUsageHourlyRowOutput struct {
	ProjectID             string `json:"projectId"`
	WorkspaceID           string `json:"workspaceId"`
	WorkspacePath         string `json:"workspacePath"`
	OrganizationID        string `json:"organizationId"`
	AgentKind             string `json:"agentKind"`
	Model                 string `json:"model"`
	ModelNormalized       string `json:"modelNormalized"`
	BucketStartHourUTC    string `json:"bucketStartHourUtc"`
	InputTokens           int64  `json:"inputTokens"`
	OutputTokens          int64  `json:"outputTokens"`
	CachedInputTokens     int64  `json:"cachedInputTokens"`
	CachedWriteTokens     int64  `json:"cachedWriteTokens"`
	ReasoningTokens       int64  `json:"reasoningTokens"`
	TotalTokens           int64  `json:"totalTokens"`
	TotalCostMicrosUSD    int64  `json:"totalCostMicrosUsd"`
	CostSource            string `json:"costSource"`
	EventCount            int64  `json:"eventCount"`
	SessionCount          int64  `json:"sessionCount"`
	TurnCount             int64  `json:"turnCount"`
	ToolCallCount         int64  `json:"toolCallCount"`
	AttributionConfidence string `json:"attributionConfidence"`
	IngestedAt            string `json:"ingestedAt"`
	RunID                 string `json:"runId"`
}

type TokenUsageHourlyRowInput struct {
	ProjectID             string `json:"projectId"`
	WorkspaceID           string `json:"workspaceId"`
	WorkspacePath         string `json:"workspacePath"`
	AgentKind             string `json:"agentKind"`
	Model                 string `json:"model"`
	ModelNormalized       string `json:"modelNormalized"`
	BucketStartHourUTC    string `json:"bucketStartHourUtc"`
	InputTokens           int64  `json:"inputTokens"`
	OutputTokens          int64  `json:"outputTokens"`
	CachedInputTokens     int64  `json:"cachedInputTokens"`
	CachedWriteTokens     int64  `json:"cachedWriteTokens"`
	ReasoningTokens       int64  `json:"reasoningTokens"`
	TotalTokens           int64  `json:"totalTokens"`
	TotalCostMicrosUSD    int64  `json:"totalCostMicrosUsd"`
	CostSource            string `json:"costSource"`
	EventCount            int64  `json:"eventCount"`
	SessionCount          int64  `json:"sessionCount"`
	TurnCount             int64  `json:"turnCount"`
	ToolCallCount         int64  `json:"toolCallCount"`
	AttributionConfidence string `json:"attributionConfidence"`
	IngestedAt            string `json:"ingestedAt"`
	RunID                 string `json:"runId"`
}

func (c *Client) ListTokenUsageHourly(orgID string, input ListTokenUsageHourlyInput) ([]TokenUsageHourlyRowOutput, error) {
	query := make([]string, 0, 5)
	if input.ProjectID != "" {
		query = append(query, "projectId="+input.ProjectID)
	}
	if input.WorkspaceID != "" {
		query = append(query, "workspaceId="+input.WorkspaceID)
	}
	if input.AgentKind != "" {
		query = append(query, "agentKind="+input.AgentKind)
	}
	if input.From != "" {
		query = append(query, "from="+input.From)
	}
	if input.To != "" {
		query = append(query, "to="+input.To)
	}
	if input.Limit > 0 {
		query = append(query, fmt.Sprintf("limit=%d", input.Limit))
	}
	path := "/orgs/" + orgID + "/token-usage/hourly"
	if len(query) > 0 {
		path += "?" + query[0]
		for i := 1; i < len(query); i++ {
			path += "&" + query[i]
		}
	}
	var rows []TokenUsageHourlyRowOutput
	err := c.DoDecode("GET", path, nil, &rows)
	return rows, err
}

func (c *Client) UpsertTokenUsageHourly(orgID string, rows []TokenUsageHourlyRowInput) (OKResponse, error) {
	var response OKResponse
	payload := map[string]any{"rows": rows}
	err := c.DoDecode("POST", "/orgs/"+orgID+"/token-usage/hourly", payload, &response)
	return response, err
}
