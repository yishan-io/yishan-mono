package memory

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"yishan/apps/cli/internal/config"
)

const maxPiSessionScanLineBytes = 1024 * 1024

func (r *agentDBReader) readPiSession(workspacePath string) (*sessionMessages, error) {
	roots, err := resolvePiSessionRoots()
	if err != nil {
		return nil, err
	}

	jsonlFiles, err := listPiTranscriptFiles(roots)
	if err != nil {
		return nil, err
	}
	if len(jsonlFiles) == 0 {
		return nil, fmt.Errorf("no pi session files found")
	}

	for _, jsonlFile := range jsonlFiles {
		session, err := readPiTranscript(jsonlFile, workspacePath)
		if err != nil {
			continue
		}
		if len(session.Messages) == 0 || isSummarizeJobSession(session) {
			continue
		}
		return session, nil
	}

	return nil, fmt.Errorf("no pi session found for workspace %s", workspacePath)
}

func resolvePiSessionRoots() ([]string, error) {
	managedRoot, err := config.ManagedPiSessionsDir()
	if err != nil {
		return nil, fmt.Errorf("resolve managed pi session root: %w", err)
	}
	legacyRoot, err := resolveLegacyPiSessionRoot()
	if err != nil {
		return nil, err
	}
	return []string{managedRoot, legacyRoot}, nil
}

func resolveLegacyPiSessionRoot() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home dir: %w", err)
	}
	return filepath.Join(homeDir, ".pi", "agent", "sessions"), nil
}

func listPiTranscriptFiles(roots []string) ([]string, error) {
	type piFileInfo struct {
		path  string
		mtime time.Time
	}

	seenPaths := make(map[string]struct{})
	files := make([]piFileInfo, 0, 64)
	for _, root := range roots {
		if strings.TrimSpace(root) == "" {
			continue
		}
		err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				if os.IsNotExist(walkErr) {
					return nil
				}
				return walkErr
			}
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
				return nil
			}
			if _, exists := seenPaths[path]; exists {
				return nil
			}
			info, err := entry.Info()
			if err != nil {
				return nil
			}
			seenPaths[path] = struct{}{}
			files = append(files, piFileInfo{path: path, mtime: info.ModTime()})
			return nil
		})
		if err != nil {
			return nil, fmt.Errorf("walk pi sessions %s: %w", root, err)
		}
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].mtime.After(files[j].mtime)
	})

	paths := make([]string, 0, len(files))
	for _, file := range files {
		paths = append(paths, file.path)
	}
	return paths, nil
}

func readPiTranscript(filePath string, workspacePath string) (*sessionMessages, error) {
	fileHandle, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("open pi session file %s: %w", filePath, err)
	}
	defer fileHandle.Close()

	sessionID := strings.TrimSuffix(filepath.Base(filePath), ".jsonl")
	sessionCWD := ""
	messages := make([]sessionMessage, 0, 32)

	scanner := bufio.NewScanner(fileHandle)
	scanner.Buffer(make([]byte, 0, 64*1024), maxPiSessionScanLineBytes)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		message, nextSessionID, nextCWD, ok := parsePiTranscriptLine(line)
		if nextSessionID != "" {
			sessionID = nextSessionID
		}
		if nextCWD != "" {
			sessionCWD = nextCWD
		}
		if !ok {
			continue
		}
		messages = append(messages, message)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan pi session file %s: %w", filePath, err)
	}

	if !piSessionMatchesWorkspace(sessionCWD, workspacePath) {
		return &sessionMessages{SessionID: sessionID}, nil
	}

	return &sessionMessages{SessionID: sessionID, Messages: messages}, nil
}

func parsePiTranscriptLine(line string) (sessionMessage, string, string, bool) {
	var top map[string]any
	if err := json.Unmarshal([]byte(line), &top); err != nil {
		return sessionMessage{}, "", "", false
	}

	switch strings.TrimSpace(getStringValue(top, "type")) {
	case "session":
		return sessionMessage{}, getStringValue(top, "id", "sessionId", "session_id"), cleanPiCWD(getStringValue(top, "cwd")), false
	case "message":
		return parsePiTranscriptMessage(top)
	default:
		return sessionMessage{}, "", "", false
	}
}

func parsePiTranscriptMessage(top map[string]any) (sessionMessage, string, string, bool) {
	messageMap, ok := top["message"].(map[string]any)
	if !ok {
		return sessionMessage{}, "", "", false
	}

	role := strings.TrimSpace(getStringValue(messageMap, "role"))
	if role != "user" && role != "assistant" {
		return sessionMessage{}, "", cleanPiCWD(getStringValue(top, "cwd")), false
	}

	content := extractPiTranscriptText(messageMap["content"])
	if content == "" {
		return sessionMessage{}, "", cleanPiCWD(getStringValue(top, "cwd")), false
	}

	timestamp, _ := time.Parse(time.RFC3339Nano, getStringValue(top, "timestamp"))
	return sessionMessage{
		Role:      role,
		Content:   content,
		Timestamp: timestamp,
	}, "", cleanPiCWD(getStringValue(top, "cwd")), true
}

func extractPiTranscriptText(content any) string {
	switch typed := content.(type) {
	case string:
		return strings.TrimSpace(typed)
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			contentPart, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if strings.TrimSpace(getStringValue(contentPart, "type")) != "text" {
				continue
			}
			text := strings.TrimSpace(getStringValue(contentPart, "text"))
			if text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, "\n\n")
	default:
		return ""
	}
}

func getStringValue(data map[string]any, keys ...string) string {
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

func cleanPiCWD(cwd string) string {
	trimmed := strings.TrimSpace(cwd)
	if trimmed == "" {
		return ""
	}
	return filepath.Clean(trimmed)
}

func piSessionMatchesWorkspace(sessionCWD string, workspacePath string) bool {
	if strings.TrimSpace(workspacePath) == "" {
		return true
	}
	if strings.TrimSpace(sessionCWD) == "" {
		return false
	}
	cleanWorkspacePath := filepath.Clean(workspacePath)
	cleanSessionCWD := filepath.Clean(sessionCWD)
	return cleanSessionCWD == cleanWorkspacePath || strings.HasPrefix(cleanSessionCWD, cleanWorkspacePath+string(filepath.Separator))
}
