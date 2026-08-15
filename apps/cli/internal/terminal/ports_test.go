package terminal

import "testing"

func TestStripANSI(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "no escape codes",
			input: "hello world",
			want:  "hello world",
		},
		{
			name:  "CSI color reset",
			input: "http://127.0.0.1\x1b[0m:3000",
			want:  "http://127.0.0.1:3000",
		},
		{
			name:  "CSI bold color",
			input: "\x1b[1;32mListening on port 8080\x1b[0m",
			want:  "Listening on port 8080",
		},
		{
			name:  "Fe sequence (ESC M)",
			input: "text\x1bMmore",
			want:  "textmore",
		},
		{
			name:  "OSC window title with BEL",
			input: "\x1b]0;mytitle\x07Listening on :5173",
			want:  "Listening on :5173",
		},
		{
			name:  "multiple sequences",
			input: "\x1b[32mAvailable on:\x1b[0m\n  \x1b[36mhttp://localhost\x1b[0m:1234",
			want:  "Available on:\n  http://localhost:1234",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := stripANSI(tc.input)
			if got != tc.want {
				t.Fatalf("stripANSI(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestOutputMentionsPorts(t *testing.T) {
	match := []struct {
		name  string
		input string
	}{
		{"bare :port", ":3000"},
		{"localhost:port", "localhost:3000"},
		{"127.0.0.1:port", "http://127.0.0.1:3000"},
		{"0.0.0.0:port", "0.0.0.0:8080"},
		{"[::]:port", "[::]  :5173"},
		{"port keyword", "Server running on port 8080"},
		{"port= form", "port=3000"},
		{"listening on", "Listening on :3000"},
		{"running on url", "running on http://localhost:5173"},
		{"started on", "started on 0.0.0.0:4000"},
		{"available at", "available at http://localhost:1234"},
		{"http-server style", "  http://127.0.0.1:1234"},
		{"vite style", "\x1b[32m  ➜  Local:\x1b[0m   \x1b[36mhttp://localhost\x1b[0m\x1b[36m:5173/\x1b[0m"},
		{"next.js style", "\x1b[32m✓\x1b[0m Ready in 2s\n- Local: http://localhost:3000"},
		{"ANSI split address:port", "http://127.0.0.1\x1b[0m:3000"},
		{"color around port keyword", "\x1b[1mport\x1b[0m 9000"},
	}

	for _, tc := range match {
		t.Run("match/"+tc.name, func(t *testing.T) {
			if !outputMentionsPorts(tc.input) {
				t.Fatalf("outputMentionsPorts(%q) = false, want true", tc.input)
			}
		})
	}

	noMatch := []struct {
		name  string
		input string
	}{
		{"plain text", "hello world"},
		{"too long port", ":123456"},
		{"git sha", "abc123def456"},
		{"version number", "v1.2.3"},
	}
	// Note: ":80", "12:34:56" and similar are intentional false-positives —
	// they trigger an extra lsof scan but never report a wrong port number.

	for _, tc := range noMatch {
		t.Run("no-match/"+tc.name, func(t *testing.T) {
			if outputMentionsPorts(tc.input) {
				t.Fatalf("outputMentionsPorts(%q) = true, want false", tc.input)
			}
		})
	}
}
