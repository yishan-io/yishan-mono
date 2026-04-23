package output

import (
	"encoding/json"
	"fmt"
)

func PrintResponse(body []byte) error {
	decoded, ok := decodeJSONResponse(body)
	if !ok {
		fmt.Println(string(body))
		return nil
	}

	return PrintAny(decoded)
}

func PrintAny(decoded any) error {
	normalized, ok := normalizeDecoded(decoded)
	if !ok {
		return PrintRenderData(RenderData{Object: decoded})
	}

	return PrintRenderData(inferRenderData(normalized))
}

func PrintRenderData(data RenderData) error {
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
