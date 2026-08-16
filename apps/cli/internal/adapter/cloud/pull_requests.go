package cloud

// Workspace pull-request endpoint and its DTO.

type UpsertWorkspacePullRequestInput struct {
	PrID       string         `json:"prId"`
	Title      string         `json:"title,omitempty"`
	URL        string         `json:"url,omitempty"`
	Branch     string         `json:"branch,omitempty"`
	BaseBranch string         `json:"baseBranch,omitempty"`
	State      string         `json:"state"`
	Metadata   map[string]any `json:"metadata,omitempty"`
	DetectedAt string         `json:"detectedAt"`
	ResolvedAt string         `json:"resolvedAt,omitempty"`
}

func (c *Client) UpsertWorkspacePullRequest(orgID string, projectID string, workspaceID string, input UpsertWorkspacePullRequestInput) (OKResponse, error) {
	var response OKResponse
	err := c.DoDecode("PUT", "/orgs/"+orgID+"/projects/"+projectID+"/workspaces/"+workspaceID+"/pull-requests", input, &response)
	return response, err
}
