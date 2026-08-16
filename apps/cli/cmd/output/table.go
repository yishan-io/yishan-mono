package output

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/jedib0t/go-pretty/v6/table"
)

func printTableRows(rows []map[string]any, preferredColumns []string) error {
	if len(rows) == 0 {
		fmt.Println("(no results)")
		return nil
	}

	columnSet := map[string]struct{}{}
	for _, row := range rows {
		for key := range row {
			columnSet[key] = struct{}{}
		}
	}

	columns := preferredColumns
	if len(columns) == 0 {
		columns = orderedColumns(columnSet)
	}
	if len(columns) == 0 {
		fmt.Println("(no results)")
		return nil
	}

	writer := table.NewWriter()
	writer.SetStyle(table.StyleLight)
	writer.AppendHeader(toHeaderRow(columns))
	for _, row := range rows {
		values := make([]string, 0, len(columns))
		for _, column := range columns {
			values = append(values, formatCell(row[column]))
		}
		writer.AppendRow(toTableRow(values))
	}

	fmt.Println(writer.Render())

	return nil
}

func toHeaderRow(columns []string) table.Row {
	headers := make([]string, 0, len(columns))
	for _, column := range columns {
		headers = append(headers, formatHeaderLabel(column))
	}

	return toTableRow(headers)
}

func toTableRow(values []string) table.Row {
	row := make(table.Row, 0, len(values))
	for _, value := range values {
		row = append(row, value)
	}

	return row
}

func orderedColumns(columns map[string]struct{}) []string {
	preferred := []string{
		"id",
		"name",
		"memberCount",
		"email",
		"role",
		"scope",
		"organizationId",
		"projectId",
		"nodeId",
		"kind",
		"branch",
		"localPath",
		"repoProvider",
		"repoUrl",
		"createdAt",
		"updatedAt",
	}

	ordered := make([]string, 0, len(columns))
	for _, key := range preferred {
		if _, ok := columns[key]; ok {
			ordered = append(ordered, key)
			delete(columns, key)
		}
	}

	remaining := make([]string, 0, len(columns))
	for key := range columns {
		remaining = append(remaining, key)
	}
	sort.Strings(remaining)

	return append(ordered, remaining...)
}

func formatCell(value any) string {
	switch v := value.(type) {
	case nil:
		return "-"
	case string:
		if strings.TrimSpace(v) == "" {
			return "-"
		}
		return v
	case bool:
		if v {
			return "true"
		}
		return "false"
	case float64:
		if float64(int64(v)) == v {
			return fmt.Sprintf("%d", int64(v))
		}
		return fmt.Sprintf("%g", v)
	default:
		encoded, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		if len(encoded) == 0 {
			return "-"
		}
		return string(encoded)
	}
}
