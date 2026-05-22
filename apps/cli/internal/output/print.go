package output

import (
	"encoding/json"
	"fmt"
	"os"
)

func PrintResponse(body []byte) error {
	decoded, ok := decodeJSONResponse(body)
	if !ok {
		fmt.Println(string(body))
		return nil
	}

	if IsJSONOutput() {
		return printAsJSON(decoded)
	}

	return PrintAny(decoded)
}

func PrintAny(decoded any) error {
	if IsJSONOutput() {
		return printAsJSON(decoded)
	}

	normalized, ok := normalizeDecoded(decoded)
	if !ok {
		return PrintRenderData(RenderData{Object: decoded})
	}

	return PrintRenderData(inferRenderData(normalized))
}

func PrintRenderData(data RenderData) error {
	if IsJSONOutput() {
		return printAsJSON(renderDataToJSON(data))
	}

	if data.Title != "" {
		fmt.Printf("%s:\n", data.Title)
	}

	if data.Rows != nil {
		return printTableRows(data.Rows, data.Columns)
	}

	if data.Object == nil {
		fmt.Println("{}")
		return nil
	}

	pretty, err := json.MarshalIndent(data.Object, "", "  ")
	if err != nil {
		return fmt.Errorf("format response body: %w", err)
	}

	fmt.Println(string(pretty))
	return nil
}

func printAsJSON(value any) error {
	pretty, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("format response body: %w", err)
	}

	fmt.Println(string(pretty))
	return nil
}

func renderDataToJSON(data RenderData) any {
	if data.Object != nil {
		return data.Object
	}

	if data.Rows != nil {
		if data.Title != "" {
			return map[string]any{data.Title: data.Rows}
		}
		return data.Rows
	}

	if data.Title != "" {
		return map[string]string{"title": data.Title}
	}

	return map[string]any{}
}

// PrintError writes a structured error to stderr. When JSON output is active
// the envelope is:
//
//	{"error": {"code": "<code>", "message": "<message>"}}
//
// In default mode it writes nothing — Cobra already prints "Error: <msg>" to
// stderr itself, so we only need to act in JSON mode.
func PrintError(err error, code string) {
	if !IsJSONOutput() {
		return
	}

	envelope := map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": err.Error(),
		},
	}

	b, encErr := json.MarshalIndent(envelope, "", "  ")
	if encErr != nil {
		// Last-resort: write plain text so the caller is never left with silence.
		_, _ = fmt.Fprintf(os.Stderr, `{"error":{"code":"internal","message":%q}}`+"\n", err.Error())
		return
	}

	_, _ = fmt.Fprintln(os.Stderr, string(b))
}
