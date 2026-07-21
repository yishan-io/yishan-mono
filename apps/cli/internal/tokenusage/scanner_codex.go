package tokenusage

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"yishan/apps/cli/internal/agentkind"
)

const codexAgentKind = agentkind.Codex
const maxTokenUsageScanLineBytes = 16 * 1024 * 1024

type codexUsage struct {
	InputTokens       int64
	OutputTokens      int64
	CachedInputTokens int64
	CachedWriteTokens int64
	ReasoningTokens   int64
	TotalTokens       int64
}

type codexEvent struct {
	SessionID string
	Model     string
	CWD       string
	Timestamp time.Time
	Usage     codexUsage
}

type codexSessionState struct {
	LastTotals *codexUsage
}

func ScanCodexHourlyUsage(ctx context.Context, input ScanInput) ([]HourlyUsageRow, error) {
	files, err := listCodexSessionFiles(input.SessionRoot, input)
	if err != nil {
		return nil, err
	}
	buckets := make(map[hourlyKey]*hourlyAccumulator)
	states := make(map[string]*codexSessionState)
	for _, sessionFile := range files {
		if err := scanCodexSessionFile(ctx, sessionFile, input, input.Worktrees, states, buckets); err != nil {
			return nil, err
		}
	}
	return materializeHourlyRows(buckets, input), nil
}

func listCodexSessionFiles(sessionRoot string, input ScanInput) ([]string, error) {
	resolvedRoot, err := resolveCodexSessionRoot(sessionRoot)
	if err != nil {
		return nil, err
	}
	files := make([]string, 0, 128)
	err = filepath.WalkDir(resolvedRoot, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if strings.HasSuffix(d.Name(), ".jsonl") {
			if !shouldScanFileWithModTime(path, input) {
				return nil
			}
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("walk codex session root %q: %w", resolvedRoot, err)
	}
	sort.Strings(files)
	return files, nil
}

func resolveCodexSessionRoot(sessionRoot string) (string, error) {
	if strings.TrimSpace(sessionRoot) != "" {
		return sessionRoot, nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home dir: %w", err)
	}
	return filepath.Join(homeDir, ".codex", "sessions"), nil
}

func scanCodexSessionFile(
	ctx context.Context,
	sessionFile string,
	input ScanInput,
	worktrees []WorktreeRef,
	states map[string]*codexSessionState,
	buckets map[hourlyKey]*hourlyAccumulator,
) error {
	fileHandle, err := os.Open(sessionFile)
	if err != nil {
		return fmt.Errorf("open codex session file %q: %w", sessionFile, err)
	}
	defer fileHandle.Close()

	var currentSessionID string
	var currentCWD string
	var currentModel string

	scanner := bufio.NewScanner(fileHandle)
	scanner.Buffer(make([]byte, 0, 64*1024), maxTokenUsageScanLineBytes)
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return err
		}
		currentSessionID, currentCWD, currentModel = handleCodexScannedLine(
			scanner.Bytes(),
			currentSessionID,
			currentCWD,
			currentModel,
			sessionFile,
			input,
			worktrees,
			states,
			buckets,
		)
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scan codex session file %q: %w", sessionFile, err)
	}
	return nil
}

func handleCodexScannedLine(
	rawLine []byte,
	currentSessionID string,
	currentCWD string,
	currentModel string,
	sessionFile string,
	input ScanInput,
	worktrees []WorktreeRef,
	states map[string]*codexSessionState,
	buckets map[hourlyKey]*hourlyAccumulator,
) (string, string, string) {
	line := parseCodexLine(rawLine)
	switch line.kind {
	case codexLineSessionMeta:
		if line.sessionID != "" {
			currentSessionID = line.sessionID
		}
		if line.cwd != "" {
			currentCWD = line.cwd
		}
	case codexLineTurnContext:
		currentCWD, currentModel = handleCodexTurnContext(
			line,
			currentSessionID,
			currentCWD,
			currentModel,
			sessionFile,
			worktrees,
			buckets,
		)
	case codexLineTokenCount:
		handleCodexTokenCount(
			line,
			currentSessionID,
			currentCWD,
			currentModel,
			sessionFile,
			input,
			worktrees,
			states,
			buckets,
		)
	default:
		if line.toolCalls > 0 {
			applyCodexEngagementEvent(codexEvent{
				SessionID: currentSessionID,
				Model:     currentModel,
				CWD:       currentCWD,
				Timestamp: line.timestamp,
			}, sessionFile, worktrees, buckets, 0, line.toolCalls)
		}
	}
	return currentSessionID, currentCWD, currentModel
}

func handleCodexTurnContext(
	line codexParsedLine,
	currentSessionID string,
	currentCWD string,
	currentModel string,
	sessionFile string,
	worktrees []WorktreeRef,
	buckets map[hourlyKey]*hourlyAccumulator,
) (string, string) {
	if line.cwd != "" {
		currentCWD = line.cwd
	}
	if line.model != "" {
		currentModel = line.model
	}
	if line.text != "" {
		applyCodexEngagementEvent(codexEvent{
			SessionID: currentSessionID,
			Model:     currentModel,
			CWD:       currentCWD,
			Timestamp: line.timestamp,
		}, sessionFile, worktrees, buckets, 1, 0)
	}
	return currentCWD, currentModel
}

func handleCodexTokenCount(
	line codexParsedLine,
	currentSessionID string,
	currentCWD string,
	currentModel string,
	sessionFile string,
	input ScanInput,
	worktrees []WorktreeRef,
	states map[string]*codexSessionState,
	buckets map[hourlyKey]*hourlyAccumulator,
) {
	model := currentModel
	if model == "" {
		model = "unknown"
	}
	event := codexEvent{
		SessionID: currentSessionID,
		Model:     model,
		CWD:       currentCWD,
		Timestamp: line.timestamp,
		Usage:     line.usage,
	}
	if event.SessionID == "" {
		return
	}
	if isBeforeScanWindow(event.Timestamp, input) {
		state := getSessionState(states, event.SessionID)
		state.LastTotals = &event.Usage
		return
	}
	applyCodexEvent(event, sessionFile, worktrees, states, buckets)
}
