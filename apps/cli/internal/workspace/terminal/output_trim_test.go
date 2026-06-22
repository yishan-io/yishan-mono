package terminal

import (
	"strings"
	"testing"
)

func TestTrimTerminalOutputToMaxBytesSkipsBrokenOSCPrefix(t *testing.T) {
	oscSequence := "\x1b]11;rgb:3131/3636/3f3f\x1b\\"
	data := "prefix-" + oscSequence + "visible-output"

	trimmed := trimTerminalOutputToMaxBytes(data, len("11;rgb:3131/3636/3f3f\x1b\\visible-output"))

	if strings.HasPrefix(trimmed, "]11;") || strings.HasPrefix(trimmed, "11;rgb:") || strings.HasPrefix(trimmed, "rgb:") {
		t.Fatalf("expected trim to skip broken OSC prefix, got %q", trimmed)
	}

	if !strings.HasSuffix(trimmed, "visible-output") {
		t.Fatalf("expected trimmed output to retain visible suffix, got %q", trimmed)
	}
}

func TestTrimTerminalOutputToMaxBytesSkipsBrokenCSIPrefix(t *testing.T) {
	csiSequence := "\x1b[38;2;255;255;255m"
	data := "prefix-" + csiSequence + "visible-output"

	trimmed := trimTerminalOutputToMaxBytes(data, len("[38;2;255;255;255mvisible-output"))

	if strings.HasPrefix(trimmed, "[38;2;255;255;255m") {
		t.Fatalf("expected trim to skip broken CSI prefix, got %q", trimmed)
	}

	if !strings.HasSuffix(trimmed, "visible-output") {
		t.Fatalf("expected trimmed output to retain visible suffix, got %q", trimmed)
	}
}
