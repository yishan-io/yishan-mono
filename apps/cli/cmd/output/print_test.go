package output

import (
	"io"
	"os"
	"strings"
	"testing"
)

func captureStdout(t *testing.T, run func()) string {
	t.Helper()

	original := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("create pipe: %v", err)
	}
	os.Stdout = w

	run()

	_ = w.Close()
	os.Stdout = original

	output, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}

	return string(output)
}

func TestPrintRenderData_JSONOutput(t *testing.T) {
	if err := SetFormat("json"); err != nil {
		t.Fatalf("set json format: %v", err)
	}
	t.Cleanup(func() {
		_ = SetFormat("default")
	})

	printed := captureStdout(t, func() {
		err := PrintRenderData(RenderData{
			Title: "daemon",
			Rows: []map[string]any{{
				"running": true,
				"pid":     123,
			}},
		})
		if err != nil {
			t.Fatalf("print render data: %v", err)
		}
	})

	if !strings.Contains(printed, `"daemon"`) {
		t.Fatalf("expected title key in json output, got: %s", printed)
	}
	if !strings.Contains(printed, `"running": true`) {
		t.Fatalf("expected running field in json output, got: %s", printed)
	}
}

func TestSetFormat_Invalid(t *testing.T) {
	if err := SetFormat("xml"); err == nil {
		t.Fatal("expected invalid format error")
	}
}
