package output

import (
	"fmt"
	"strings"
)

type Format string

const (
	FormatDefault Format = "default"
	FormatJSON    Format = "json"
)

var currentFormat = FormatDefault

func SetFormat(raw string) error {
	switch Format(strings.ToLower(strings.TrimSpace(raw))) {
	case "", FormatDefault:
		currentFormat = FormatDefault
		return nil
	case FormatJSON:
		currentFormat = FormatJSON
		return nil
	default:
		return fmt.Errorf("invalid output format %q: use default or json", raw)
	}
}

// IsJSONOutput reports whether the current output format is JSON.
func IsJSONOutput() bool {
	return currentFormat == FormatJSON
}
