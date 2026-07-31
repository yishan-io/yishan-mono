package api

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
)

func (c *Client) ExportProjects(orgID string) ([]OrganizationExportProject, error) {
	records, err := c.readOrganizationExportCSV(orgID, "project")
	if err != nil {
		return nil, err
	}
	return parseProjectExport(records)
}

func (c *Client) ExportWorkspaces(orgID string) ([]OrganizationExportWorkspace, error) {
	records, err := c.readOrganizationExportCSV(orgID, "workspace")
	if err != nil {
		return nil, err
	}
	return parseWorkspaceExport(records)
}

func (c *Client) ExportTokenUsageHourly(orgID string) ([]TokenUsageHourlyRowOutput, error) {
	records, err := c.readOrganizationExportCSV(orgID, "usage")
	if err != nil {
		return nil, err
	}
	return parseUsageExport(records)
}

func (c *Client) readOrganizationExportCSV(orgID string, exportType string) ([][]string, error) {
	query := url.Values{}
	query.Set("type", exportType)
	path := "/orgs/" + url.PathEscape(orgID) + "/export?" + query.Encode()
	body, err := c.DoRaw("GET", path, nil)
	if err != nil {
		return nil, err
	}

	reader := csv.NewReader(bytes.NewReader(body))
	reader.FieldsPerRecord = -1
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("parse organization export csv for %s: %w", exportType, err)
	}
	return records, nil
}

func parseProjectExport(records [][]string) ([]OrganizationExportProject, error) {
	header, rows, err := splitCSVRecords(records, []string{
		"id", "name", "sourceType", "repoProvider", "repoUrl", "repoKey", "icon", "color", "setupScript",
		"postScript", "commands", "contextEnabled", "organizationId", "createdByUserId", "createdAt", "updatedAt",
	})
	if err != nil {
		return nil, err
	}
	projects := make([]OrganizationExportProject, 0, len(rows))
	for _, row := range rows {
		contextEnabled, err := strconv.ParseBool(csvValue(row, header, "contextEnabled"))
		if err != nil {
			return nil, fmt.Errorf("parse project contextEnabled: %w", err)
		}
		commands, err := parseProjectCommands(csvValue(row, header, "commands"))
		if err != nil {
			return nil, err
		}
		projects = append(projects, OrganizationExportProject{
			ID:              csvValue(row, header, "id"),
			Name:            csvValue(row, header, "name"),
			SourceType:      csvValue(row, header, "sourceType"),
			RepoProvider:    csvOptionalValue(row, header, "repoProvider"),
			RepoURL:         csvOptionalValue(row, header, "repoUrl"),
			RepoKey:         csvOptionalValue(row, header, "repoKey"),
			Icon:            csvValue(row, header, "icon"),
			Color:           csvValue(row, header, "color"),
			SetupScript:     csvValue(row, header, "setupScript"),
			PostScript:      csvValue(row, header, "postScript"),
			Commands:        commands,
			ContextEnabled:  contextEnabled,
			OrganizationID:  csvValue(row, header, "organizationId"),
			CreatedByUserID: csvOptionalValue(row, header, "createdByUserId"),
			CreatedAt:       csvValue(row, header, "createdAt"),
			UpdatedAt:       csvValue(row, header, "updatedAt"),
		})
	}
	return projects, nil
}

func parseWorkspaceExport(records [][]string) ([]OrganizationExportWorkspace, error) {
	header, rows, err := splitCSVRecords(records, []string{
		"id", "organizationId", "projectId", "nodeId", "kind", "status", "branch", "sourceBranch", "localPath",
		"createdAt", "updatedAt",
	})
	if err != nil {
		return nil, err
	}
	workspaces := make([]OrganizationExportWorkspace, 0, len(rows))
	for _, row := range rows {
		workspaces = append(workspaces, OrganizationExportWorkspace{
			ID:             csvValue(row, header, "id"),
			OrganizationID: csvValue(row, header, "organizationId"),
			ProjectID:      csvValue(row, header, "projectId"),
			NodeID:         csvValue(row, header, "nodeId"),
			Kind:           csvValue(row, header, "kind"),
			Status:         csvValue(row, header, "status"),
			Branch:         csvOptionalValue(row, header, "branch"),
			SourceBranch:   csvOptionalValue(row, header, "sourceBranch"),
			LocalPath:      csvValue(row, header, "localPath"),
			CreatedAt:      csvValue(row, header, "createdAt"),
			UpdatedAt:      csvValue(row, header, "updatedAt"),
		})
	}
	return workspaces, nil
}

func parseUsageExport(records [][]string) ([]TokenUsageHourlyRowOutput, error) {
	header, rows, err := splitCSVRecords(records, []string{
		"projectId", "workspaceId", "workspacePath", "organizationId", "agentKind", "model", "modelNormalized",
		"bucketStartHourUtc", "inputTokens", "outputTokens", "cachedInputTokens", "cachedWriteTokens",
		"reasoningTokens", "totalTokens", "eventCount", "sessionCount", "turnCount", "toolCallCount",
		"attributionConfidence", "ingestedAt", "runId",
	})
	if err != nil {
		return nil, err
	}
	usageRows := make([]TokenUsageHourlyRowOutput, 0, len(rows))
	for _, row := range rows {
		usageRow, err := parseUsageRow(row, header)
		if err != nil {
			return nil, err
		}
		usageRows = append(usageRows, usageRow)
	}
	return usageRows, nil
}

func parseUsageRow(row []string, header map[string]int) (TokenUsageHourlyRowOutput, error) {
	inputTokens, err := parseInt64Field(row, header, "inputTokens")
	if err != nil {
		return TokenUsageHourlyRowOutput{}, err
	}
	outputTokens, err := parseInt64Field(row, header, "outputTokens")
	if err != nil {
		return TokenUsageHourlyRowOutput{}, err
	}
	cachedInputTokens, err := parseInt64Field(row, header, "cachedInputTokens")
	if err != nil {
		return TokenUsageHourlyRowOutput{}, err
	}
	cachedWriteTokens, err := parseInt64Field(row, header, "cachedWriteTokens")
	if err != nil {
		return TokenUsageHourlyRowOutput{}, err
	}
	return finishUsageRowParse(row, header, inputTokens, outputTokens, cachedInputTokens, cachedWriteTokens)
}

func finishUsageRowParse(
	row []string,
	header map[string]int,
	inputTokens int64,
	outputTokens int64,
	cachedInputTokens int64,
	cachedWriteTokens int64,
) (TokenUsageHourlyRowOutput, error) {
	reasoningTokens, err := parseInt64Field(row, header, "reasoningTokens")
	if err != nil {
		return TokenUsageHourlyRowOutput{}, err
	}
	totalTokens, err := parseInt64Field(row, header, "totalTokens")
	if err != nil {
		return TokenUsageHourlyRowOutput{}, err
	}
	eventCount, err := parseInt64Field(row, header, "eventCount")
	if err != nil {
		return TokenUsageHourlyRowOutput{}, err
	}
	sessionCount, err := parseInt64Field(row, header, "sessionCount")
	if err != nil {
		return TokenUsageHourlyRowOutput{}, err
	}
	turnCount, err := parseInt64Field(row, header, "turnCount")
	if err != nil {
		return TokenUsageHourlyRowOutput{}, err
	}
	toolCallCount, err := parseInt64Field(row, header, "toolCallCount")
	if err != nil {
		return TokenUsageHourlyRowOutput{}, err
	}
	return TokenUsageHourlyRowOutput{
		ProjectID:             csvValue(row, header, "projectId"),
		WorkspaceID:           csvValue(row, header, "workspaceId"),
		WorkspacePath:         csvValue(row, header, "workspacePath"),
		OrganizationID:        csvValue(row, header, "organizationId"),
		AgentKind:             csvValue(row, header, "agentKind"),
		Model:                 csvValue(row, header, "model"),
		ModelNormalized:       csvValue(row, header, "modelNormalized"),
		BucketStartHourUTC:    csvValue(row, header, "bucketStartHourUtc"),
		InputTokens:           inputTokens,
		OutputTokens:          outputTokens,
		CachedInputTokens:     cachedInputTokens,
		CachedWriteTokens:     cachedWriteTokens,
		ReasoningTokens:       reasoningTokens,
		TotalTokens:           totalTokens,
		EventCount:            eventCount,
		SessionCount:          sessionCount,
		TurnCount:             turnCount,
		ToolCallCount:         toolCallCount,
		AttributionConfidence: csvValue(row, header, "attributionConfidence"),
		IngestedAt:            csvValue(row, header, "ingestedAt"),
		RunID:                 csvValue(row, header, "runId"),
	}, nil
}

func parseProjectCommands(raw string) ([]ProjectCommand, error) {
	if raw == "" {
		return []ProjectCommand{}, nil
	}
	var commands []ProjectCommand
	if err := json.Unmarshal([]byte(raw), &commands); err != nil {
		return nil, fmt.Errorf("parse project commands: %w", err)
	}
	return commands, nil
}

func splitCSVRecords(records [][]string, requiredHeaders []string) (map[string]int, [][]string, error) {
	if len(records) == 0 {
		return nil, nil, nil
	}
	header := make(map[string]int, len(records[0]))
	for index, name := range records[0] {
		header[name] = index
	}
	for _, requiredHeader := range requiredHeaders {
		if _, ok := header[requiredHeader]; !ok {
			return nil, nil, fmt.Errorf("missing csv header %q", requiredHeader)
		}
	}
	return header, records[1:], nil
}

func parseInt64Field(row []string, header map[string]int, key string) (int64, error) {
	value, err := strconv.ParseInt(csvValue(row, header, key), 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", key, err)
	}
	return value, nil
}

func csvValue(row []string, header map[string]int, key string) string {
	index, ok := header[key]
	if !ok || index >= len(row) {
		return ""
	}
	return row[index]
}

func csvOptionalValue(row []string, header map[string]int, key string) *string {
	value := csvValue(row, header, key)
	if value == "" {
		return nil
	}
	return &value
}
