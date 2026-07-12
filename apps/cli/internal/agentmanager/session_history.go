package agentmanager

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"yishan/apps/cli/internal/config"
)

const maxSessionSummaryScanLineBytes = 1024 * 1024

// SessionSummary is one history entry loaded from a managed session file.
type SessionSummary struct {
	SessionID   string    `json:"sessionId"`
	Timestamp   time.Time `json:"timestamp"`
	Model       string    `json:"model,omitempty"`
	PreviewText string    `json:"previewText,omitempty"`
}

type sessionPreviewCollector struct {
	firstReadableText string
	firstUserText     string
}

func (c *sessionPreviewCollector) update(role string, text string) {
	if text == "" {
		return
	}
	if c.firstReadableText == "" {
		c.firstReadableText = text
	}
	if role == "user" && c.firstUserText == "" {
		c.firstUserText = text
	}
}

func (c *sessionPreviewCollector) preview() string {
	if c.firstUserText != "" {
		return c.firstUserText
	}
	return c.firstReadableText
}

// ListSessionSummaries reads managed sessions for one cwd and returns newest-first
// summaries suitable for session history UI.
func ListSessionSummaries(ctx context.Context, cwd string) ([]SessionSummary, error) {
	root, err := config.ManagedPiSessionsDir()
	if err != nil {
		return nil, fmt.Errorf("resolve managed session root: %w", err)
	}

	sessionDir := filepath.Join(root, encodeSessionCWD(cwd))
	return readSessionSummaries(ctx, sessionDir)
}

func readSessionSummaries(ctx context.Context, sessionDir string) ([]SessionSummary, error) {
	entries, err := os.ReadDir(sessionDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []SessionSummary{}, nil
		}
		return nil, fmt.Errorf("read session dir %q: %w", sessionDir, err)
	}

	summaries := make([]SessionSummary, 0, len(entries))
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if !isSessionSummaryFile(entry) {
			continue
		}
		summary, err := readSessionSummary(ctx, filepath.Join(sessionDir, entry.Name()))
		if err != nil {
			// Best-effort listing: skip unreadable session files so one bad transcript
			// does not hide the rest of the history.
			continue
		}
		summaries = append(summaries, summary)
	}

	sort.SliceStable(summaries, func(i, j int) bool {
		left := summaries[i]
		right := summaries[j]
		if left.Timestamp.Equal(right.Timestamp) {
			return left.SessionID > right.SessionID
		}
		return left.Timestamp.After(right.Timestamp)
	})

	return summaries, nil
}

func isSessionSummaryFile(entry os.DirEntry) bool {
	return !entry.IsDir() && strings.HasSuffix(entry.Name(), ".jsonl")
}

func encodeSessionCWD(cwd string) string {
	cleanCWD := filepath.Clean(strings.TrimSpace(cwd))
	normalized := filepath.ToSlash(cleanCWD)
	normalized = strings.TrimPrefix(normalized, "/")
	return "--" + strings.ReplaceAll(normalized, "/", "-") + "--"
}

func readSessionSummary(ctx context.Context, filePath string) (SessionSummary, error) {
	fileHandle, err := os.Open(filePath)
	if err != nil {
		return SessionSummary{}, fmt.Errorf("open session file %q: %w", filePath, err)
	}
	defer fileHandle.Close()

	fileInfo, err := fileHandle.Stat()
	if err != nil {
		return SessionSummary{}, fmt.Errorf("stat session file %q: %w", filePath, err)
	}

	summary := SessionSummary{SessionID: sessionIDFromPath(filePath)}
	collector := &sessionPreviewCollector{}
	if err := scanSessionSummaryLines(ctx, fileHandle, &summary, collector); err != nil {
		return SessionSummary{}, err
	}
	summary.PreviewText = collector.preview()
	if summary.Timestamp.IsZero() {
		summary.Timestamp = fileInfo.ModTime()
	}
	return summary, nil
}

func scanSessionSummaryLines(
	ctx context.Context,
	fileHandle *os.File,
	summary *SessionSummary,
	collector *sessionPreviewCollector,
) error {
	scanner := bufio.NewScanner(fileHandle)
	scanner.Buffer(make([]byte, 0, 64*1024), maxSessionSummaryScanLineBytes)
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return err
		}
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		top, ok := parseSessionLine(line)
		if !ok {
			// Ignore malformed lines and keep scanning the rest of the transcript.
			continue
		}
		applySessionSummaryLine(summary, top, collector)

		// Sub-agent (child) sessions include parentSession on the header line.
		// Skip them so they don't clutter session history.
		if strings.TrimSpace(getString(top, "type")) == "session" && getString(top, "parentSession") != "" {
			return fmt.Errorf("sub-agent session %q: skipped", fileHandle.Name())
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scan session file %q: %w", fileHandle.Name(), err)
	}
	return nil
}

func applySessionSummaryLine(summary *SessionSummary, top map[string]any, collector *sessionPreviewCollector) {
	switch strings.TrimSpace(getString(top, "type")) {
	case "session":
		applySessionSummarySessionLine(summary, top)
	case "model_change":
		applySessionSummaryModelChangeLine(summary, top)
	case "message":
		applySessionSummaryMessageLine(summary, top, collector)
	}
}

func applySessionSummarySessionLine(summary *SessionSummary, top map[string]any) {
	if sessionID := getString(top, "id", "sessionId", "session_id"); sessionID != "" {
		summary.SessionID = sessionID
	}
	setSessionSummaryTimestamp(summary, top["timestamp"])
	if summary.Model == "" {
		summary.Model = getString(top, "model", "modelId")
	}
}

func applySessionSummaryModelChangeLine(summary *SessionSummary, top map[string]any) {
	if summary.Model == "" {
		summary.Model = getString(top, "model", "modelId")
	}
	setSessionSummaryTimestamp(summary, top["timestamp"])
}

func applySessionSummaryMessageLine(summary *SessionSummary, top map[string]any, collector *sessionPreviewCollector) {
	if summary.Model == "" {
		summary.Model = getString(top, "model", "modelId")
	}
	setSessionSummaryTimestamp(summary, top["timestamp"])
	role, text := extractPreviewText(top)
	collector.update(role, text)
}

func setSessionSummaryTimestamp(summary *SessionSummary, value any) {
	if !summary.Timestamp.IsZero() {
		return
	}
	timestamp, ok := parseTimestampValue(value)
	if ok {
		summary.Timestamp = timestamp
	}
}

func parseSessionLine(line string) (map[string]any, bool) {
	var top map[string]any
	if err := json.Unmarshal([]byte(line), &top); err != nil {
		return nil, false
	}
	return top, true
}

func extractPreviewText(top map[string]any) (string, string) {
	messageMap, ok := top["message"].(map[string]any)
	if !ok {
		return "", ""
	}
	role := strings.TrimSpace(getString(messageMap, "role"))
	if role != "user" && role != "assistant" {
		return "", ""
	}
	return role, extractTextBlocks(messageMap["content"])
}

func extractTextBlocks(content any) string {
	switch typed := content.(type) {
	case string:
		return strings.TrimSpace(typed)
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			contentPart, ok := item.(map[string]any)
			if !ok || strings.TrimSpace(getString(contentPart, "type")) != "text" {
				continue
			}
			text := strings.TrimSpace(getString(contentPart, "text"))
			if text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, "\n\n")
	default:
		return ""
	}
}

func parseTimestampValue(value any) (time.Time, bool) {
	switch typed := value.(type) {
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return time.Time{}, false
		}
		for _, format := range []string{time.RFC3339Nano, time.RFC3339} {
			if parsed, err := time.Parse(format, trimmed); err == nil {
				return parsed, true
			}
		}
	case float64:
		return time.UnixMilli(int64(typed)), true
	case json.Number:
		if millis, err := typed.Int64(); err == nil {
			return time.UnixMilli(millis), true
		}
	}
	return time.Time{}, false
}

func sessionIDFromPath(filePath string) string {
	baseName := strings.TrimSuffix(filepath.Base(filePath), ".jsonl")
	separatorIndex := strings.LastIndex(baseName, "_")
	if separatorIndex < 0 || separatorIndex == len(baseName)-1 {
		return baseName
	}
	return baseName[separatorIndex+1:]
}

func getString(data map[string]any, keys ...string) string {
	for _, key := range keys {
		value, ok := data[key]
		if !ok {
			continue
		}
		text, ok := value.(string)
		if ok && strings.TrimSpace(text) != "" {
			return text
		}
	}
	return ""
}
