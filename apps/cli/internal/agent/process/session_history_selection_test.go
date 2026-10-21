package process

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeHistoryCandidate(t *testing.T, dir, name, body string, modified time.Time) {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, modified, modified); err != nil {
		t.Fatal(err)
	}
}

func loadHistoryCandidates(t *testing.T, dir string) []SessionSummary {
	t.Helper()
	summaries, err := readSessionSummaries(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	return summaries
}

func TestReadSessionSummaries_SelectsThirtyByMtime(t *testing.T) {
	dir := t.TempDir()
	// Deliberately old mtimes: selection must have no age cutoff.
	base := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 31; i++ {
		name := fmt.Sprintf("2099-01-01_session-%02d.jsonl", i)
		body := fmt.Sprintf(`{"type":"session","id":"session-%02d","timestamp":"2099-01-01T00:00:00Z"}`, i)
		writeHistoryCandidate(t, dir, name, body, base.Add(time.Duration(i)*time.Hour))
	}
	body := `{"type":"session","id":"recently-edited","timestamp":"1990-01-01T00:00:00Z","cwd":"/original"}
{"type":"session_info","name":"first name"}
{"type":"model_change","modelId":"test-model"}
{"type":"message","message":{"role":"assistant","content":"fallback"}}
{"type":"message","message":{"role":"user","content":[{"type":"text","text":"user preview"}]}}
{"type":"session_info","name":"latest rename"}`
	writeHistoryCandidate(t, dir, "1990-01-01_recently-edited.jsonl", body, base.Add(32*time.Hour))
	summaries := loadHistoryCandidates(t, dir)
	if len(summaries) != 30 {
		t.Fatalf("want 30 candidates, got %d", len(summaries))
	}
	for _, summary := range summaries {
		if summary.SessionID == "session-00" || summary.SessionID == "session-01" {
			t.Fatalf("selected stale mtime: %s", summary.SessionID)
		}
	}
	assertRecentlyEditedSummary(t, summaries[len(summaries)-1])
}

func assertRecentlyEditedSummary(t *testing.T, summary SessionSummary) {
	t.Helper()
	if summary.SessionID != "recently-edited" || summary.Timestamp.Year() != 1990 {
		t.Fatalf("final ordering must use header timestamp: %+v", summary)
	}
	if summary.SessionName != "latest rename" || summary.Model != "test-model" ||
		summary.PreviewText != "user preview" || summary.CWD != "/original" {
		t.Fatalf("extraction changed: %+v", summary)
	}
}

func TestReadSessionSummaries_SkippedCandidatesConsumeCap(t *testing.T) {
	for _, hasUnreadable := range []bool{false, true} {
		t.Run(fmt.Sprintf("unreadable=%t", hasUnreadable), func(t *testing.T) {
			dir := t.TempDir()
			base := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
			writeHistoryCandidate(t, dir, "older-main.jsonl", `{"type":"session","id":"main"}`, base)
			for i := 0; i < 30; i++ {
				body := `{"type":"session","id":"child","parentSession":"parent.jsonl"}`
				if hasUnreadable && i == 0 {
					// A scanner error is portable even when tests run with elevated privileges.
					body = strings.Repeat("x", maxSessionSummaryScanLineBytes+1)
				}
				writeHistoryCandidate(t, dir, fmt.Sprintf("candidate-%02d.jsonl", i), body, base.Add(time.Hour))
			}
			if summaries := loadHistoryCandidates(t, dir); len(summaries) != 0 {
				t.Fatalf("must not backfill skipped candidates: %+v", summaries)
			}
		})
	}
}

func TestReadSessionSummaries_BreaksMtimeTiesByFilename(t *testing.T) {
	dir := t.TempDir()
	modified := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	// Reverse creation order must not influence the filename-ascending cutoff.
	for i := 31; i >= 0; i-- {
		body := fmt.Sprintf(`{"type":"session","id":"session-%02d","timestamp":"2020-01-01T00:00:00Z"}`, i)
		writeHistoryCandidate(t, dir, fmt.Sprintf("session-%02d.jsonl", i), body, modified)
	}
	for attempt := 0; attempt < 3; attempt++ {
		summaries := loadHistoryCandidates(t, dir)
		if len(summaries) != 30 {
			t.Fatalf("want 30 candidates, got %d", len(summaries))
		}
		for i, summary := range summaries {
			// Existing summary ordering breaks equal timestamps by descending session ID.
			if want := fmt.Sprintf("session-%02d", 29-i); summary.SessionID != want {
				t.Fatalf("at %d want %s, got %s", i, want, summary.SessionID)
			}
		}
	}
}

func TestReadSessionSummaries_IgnoresNonJSONLBeforeSelection(t *testing.T) {
	dir := t.TempDir()
	modified := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	writeHistoryCandidate(t, dir, "main.jsonl", `{"type":"session","id":"main"}`, modified)
	for i := 0; i < 31; i++ {
		writeHistoryCandidate(t, dir, fmt.Sprintf("newer-%02d.txt", i), "ignored", modified.Add(time.Hour))
	}
	if err := os.Mkdir(filepath.Join(dir, "directory.jsonl"), 0o700); err != nil {
		t.Fatal(err)
	}
	summaries := loadHistoryCandidates(t, dir)
	if len(summaries) != 1 || summaries[0].SessionID != "main" {
		t.Fatalf("non-JSONL entries consumed selection: %+v", summaries)
	}
}

func TestReadSessionSummaries_ContextAndMissingDirectory(t *testing.T) {
	dir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := readSessionSummaries(ctx, dir); !errors.Is(err, context.Canceled) {
		t.Fatalf("want canceled for empty directory, got %v", err)
	}
	summaries, err := readSessionSummaries(context.Background(), filepath.Join(dir, "missing"))
	if err != nil || summaries == nil || len(summaries) != 0 {
		t.Fatalf("missing directory: summaries=%v err=%v", summaries, err)
	}
}
