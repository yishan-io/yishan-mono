//go:build session_summary_perf

package process

// Temporary opt-in, warm-cache experiment; not a production optimization.
// SESSION_SUMMARY_PERF_SNAPSHOT must point to the immutable selected snapshot.
import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"strings"
	"testing"
	"time"
)

const perfInitialBuffer = 64 * 1024 // Matches scanSessionSummaryLines.

type perfSnapshotMetadata struct {
	path                    string
	hash                    string
	size                    int64
	lines, payload, maxLine int
	modified                time.Time
}

var (
	perfSummarySink SessionSummary
	perfMapSink     map[string]any
	perfSizeSink    int64
	perfLinesSink   int
)

type perfLineContext struct {
	context.Context
	lines int
}

func (ctx *perfLineContext) Err() error {
	ctx.lines++
	return ctx.Context.Err()
}

func BenchmarkSessionSummaryExperiment(b *testing.B) {
	path := os.Getenv("SESSION_SUMMARY_PERF_SNAPSHOT")
	if path == "" {
		b.Skip("set SESSION_SUMMARY_PERF_SNAPSHOT to opt in")
	}
	snapshot := inspectPerfSnapshot(b, path)
	validatePerfSnapshot(b, snapshot)
	stages := []struct {
		name string
		run  func(*testing.B, perfSnapshotMetadata)
	}{
		{"OpenStatClose", benchmarkPerfOpen},
		{"ScannerBytes", func(b *testing.B, s perfSnapshotMetadata) { benchmarkPerfScan(b, s, false) }},
		{"ScannerJSON", func(b *testing.B, s perfSnapshotMetadata) { benchmarkPerfScan(b, s, true) }},
		{"LegacyFullSummary", benchmarkPerfLegacy},
		{"FullSummary", benchmarkPerfFull},
	}
	for _, stage := range stages {
		b.Run(stage.name, func(b *testing.B) { b.ReportAllocs(); stage.run(b, snapshot) })
	}
	if after := inspectPerfSnapshot(b, path); after != snapshot {
		b.Fatal("snapshot changed during benchmark")
	}
}

func inspectPerfSnapshot(b *testing.B, path string) perfSnapshotMetadata {
	b.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		b.Fatal(err)
	}
	stat, err := os.Stat(path)
	if err != nil {
		b.Fatal(err)
	}
	snapshot := perfSnapshotMetadata{path: path, hash: fmt.Sprintf("%x", sha256.Sum256(body)),
		size: int64(len(body)), modified: stat.ModTime()}
	lines := bytes.Split(body, []byte{'\n'})
	if len(body) > 0 && body[len(body)-1] == '\n' {
		lines = lines[:len(lines)-1]
	}
	if len(body) == 0 {
		lines = nil
	}
	for _, line := range lines {
		line = bytes.TrimSuffix(line, []byte{'\r'})
		snapshot.lines++
		snapshot.payload += len(line)
		if len(line) > snapshot.maxLine {
			snapshot.maxLine = len(line)
		}
	}
	if snapshot.maxLine+1 >= maxSessionSummaryScanLineBytes {
		b.Fatal("line exceeds scanner budget")
	}
	return snapshot
}

func validatePerfSnapshot(b *testing.B, snapshot perfSnapshotMetadata) {
	b.Helper()
	fileHandle := openPerfFile(b, snapshot)
	ctx := &perfLineContext{Context: context.Background()}
	summary := SessionSummary{SessionID: sessionIDFromPath(snapshot.path)}
	collector := &sessionPreviewCollector{}
	if err := scanSessionSummaryLines(ctx, fileHandle, &summary, collector); err != nil {
		b.Fatal(err)
	}
	summary.PreviewText = collector.preview()
	if summary.Timestamp.IsZero() {
		summary.Timestamp = snapshot.modified
	}
	assertPerfEOF(b, fileHandle, snapshot)
	closePerfFile(b, fileHandle)
	if ctx.lines != snapshot.lines {
		b.Fatalf("full scan lines: %d", ctx.lines)
	}
	actual, err := readSessionSummary(context.Background(), snapshot.path)
	if err != nil {
		b.Fatal(err)
	}
	legacy := readPerfLegacySummary(b, snapshot)
	if actual != summary || actual != legacy {
		b.Fatal("legacy/actual/EOF summaries differ")
	}
	scanPerfFile(b, snapshot, false, nil, nil)
	scanPerfFile(b, snapshot, true, nil, nil)
	b.Logf("verified sha256=%s bytes=%d lines=%d payload=%d maxLine=%d; EOF and identical complete summaries (including latest name and preview)",
		snapshot.hash, snapshot.size, snapshot.lines, snapshot.payload, snapshot.maxLine)
}

func openPerfFile(b *testing.B, snapshot perfSnapshotMetadata) *os.File {
	b.Helper()
	fileHandle, err := os.Open(snapshot.path)
	if err != nil {
		b.Fatal(err)
	}
	metadata, err := fileHandle.Stat()
	if err != nil {
		b.Fatal(err)
	}
	if metadata.Size() != snapshot.size || !metadata.ModTime().Equal(snapshot.modified) {
		b.Fatal("snapshot metadata changed")
	}
	perfSizeSink = metadata.Size()
	return fileHandle
}

func closePerfFile(b *testing.B, fileHandle *os.File) {
	b.Helper()
	if err := fileHandle.Close(); err != nil {
		b.Fatal(err)
	}
}

func assertPerfEOF(b *testing.B, fileHandle *os.File, snapshot perfSnapshotMetadata) {
	b.Helper()
	offset, err := fileHandle.Seek(0, io.SeekCurrent)
	if err != nil {
		b.Fatal(err)
	}
	if offset != snapshot.size {
		b.Fatalf("consumed %d bytes", offset)
	}
	var tail [1]byte
	if count, err := fileHandle.Read(tail[:]); count != 0 || err != io.EOF {
		b.Fatalf("not EOF: count=%d err=%v", count, err)
	}
}

func benchmarkPerfOpen(b *testing.B, snapshot perfSnapshotMetadata) {
	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		fileHandle := openPerfFile(b, snapshot)
		closePerfFile(b, fileHandle)
	}
}

func benchmarkPerfScan(b *testing.B, snapshot perfSnapshotMetadata, shouldParse bool) {
	b.SetBytes(snapshot.size)
	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		scanPerfFile(b, snapshot, shouldParse, nil, nil)
	}
}

func scanPerfFile(b *testing.B, snapshot perfSnapshotMetadata, shouldParse bool,
	summary *SessionSummary, collector *sessionPreviewCollector) {
	fileHandle := openPerfFile(b, snapshot)
	scanner := bufio.NewScanner(fileHandle)
	scanner.Buffer(make([]byte, 0, perfInitialBuffer), maxSessionSummaryScanLineBytes)
	ctx := context.Background()
	lines, payload := 0, 0
	var last map[string]any
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			b.Fatal(err)
		}
		lines++
		payload += len(scanner.Bytes())
		if shouldParse {
			last = parsePerfLegacyLine(b, scanner.Text(), summary, collector)
		}
	}
	if err := scanner.Err(); err != nil {
		b.Fatal(err)
	}
	if lines != snapshot.lines || payload != snapshot.payload {
		b.Fatalf("scan coverage: lines=%d payload=%d", lines, payload)
	}
	assertPerfEOF(b, fileHandle, snapshot)
	closePerfFile(b, fileHandle)
	perfMapSink, perfLinesSink = last, lines
}

func parsePerfLegacyLine(b *testing.B, line string, summary *SessionSummary,
	collector *sessionPreviewCollector) map[string]any {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil
	}
	parsed, isValid := parseSessionLine(line)
	if !isValid {
		return nil
	} // Match production malformed-line skipping.
	if summary != nil {
		applySessionSummaryLine(summary, parsed, collector)
		if strings.TrimSpace(getString(parsed, "type")) == "session" && getString(parsed, "parentSession") != "" {
			b.Fatal("child session is not a main-session benchmark candidate")
		}
	}
	return parsed
}

func readPerfLegacySummary(b *testing.B, snapshot perfSnapshotMetadata) SessionSummary {
	summary := SessionSummary{SessionID: sessionIDFromPath(snapshot.path)}
	collector := &sessionPreviewCollector{}
	scanPerfFile(b, snapshot, true, &summary, collector)
	summary.PreviewText = collector.preview()
	if summary.Timestamp.IsZero() {
		summary.Timestamp = snapshot.modified
	}
	return summary
}

func benchmarkPerfLegacy(b *testing.B, snapshot perfSnapshotMetadata) {
	b.SetBytes(snapshot.size)
	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		perfSummarySink = readPerfLegacySummary(b, snapshot)
	}
}

func benchmarkPerfFull(b *testing.B, snapshot perfSnapshotMetadata) {
	ctx := context.Background()
	b.SetBytes(snapshot.size)
	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		summary, err := readSessionSummary(ctx, snapshot.path)
		if err != nil {
			b.Fatal(err)
		}
		perfSummarySink = summary
	}
}
