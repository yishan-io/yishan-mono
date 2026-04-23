package output

import "encoding/json"

func decodeJSONResponse(body []byte) (any, bool) {
	if len(body) == 0 {
		return map[string]any{}, true
	}

	var decoded any
	if err := json.Unmarshal(body, &decoded); err != nil {
		return nil, false
	}

	return decoded, true
}

func normalizeDecoded(decoded any) (any, bool) {
	switch decoded.(type) {
	case map[string]any, []any:
		return decoded, true
	}

	encoded, err := json.Marshal(decoded)
	if err != nil {
		return nil, false
	}

	var normalized any
	if err := json.Unmarshal(encoded, &normalized); err != nil {
		return nil, false
	}

	return normalized, true
}

func inferRenderData(decoded any) RenderData {
	if rows, ok := decoded.([]any); ok {
		if mapped, ok := mapRows(rows); ok {
			return RenderData{Rows: mapped}
		}
	}

	if envelope, ok := decoded.(map[string]any); ok {
		if key, rows, ok := extractSingleArrayEnvelope(envelope); ok {
			if mapped, ok := mapRows(rows); ok {
				return RenderData{Title: key, Rows: mapped}
			}
		}
	}

	return RenderData{Object: decoded}
}

func mapRows(rows []any) ([]map[string]any, bool) {
	converted := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		object, ok := row.(map[string]any)
		if !ok {
			return nil, false
		}
		converted = append(converted, object)
	}

	return converted, true
}

func extractSingleArrayEnvelope(value map[string]any) (string, []any, bool) {
	if len(value) != 1 {
		return "", nil, false
	}

	for key, item := range value {
		rows, ok := item.([]any)
		if !ok {
			return "", nil, false
		}
		return key, rows, true
	}

	return "", nil, false
}
