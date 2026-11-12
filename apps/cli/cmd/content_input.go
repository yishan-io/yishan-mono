package cmd

import (
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"
)

// readContentInput resolves text content from a flag, a file, or stdin so
// callers never have to escape multi-line Markdown on the command line.
// The content flag and --file are mutually exclusive.
func readContentInput(command *cobra.Command, contentFlag string) (string, error) {
	content, err := command.Flags().GetString(contentFlag)
	if err != nil {
		return "", err
	}
	hasContent := command.Flags().Changed(contentFlag)
	hasFile := command.Flags().Changed("file")
	if hasContent && hasFile {
		return "", newUsageError("--%s and --file cannot be combined", contentFlag)
	}
	if !hasContent && !hasFile {
		return "", newUsageError("content is required: pass --%s, --file <path>, or --file -", contentFlag)
	}
	resolved := content
	if hasFile {
		if resolved, err = readContentFile(command); err != nil {
			return "", err
		}
	}
	if strings.TrimSpace(resolved) == "" {
		return "", newUsageError("content must not be empty")
	}
	return resolved, nil
}

// printContent writes document text exactly as stored, adding only the final
// newline a terminal needs.
func printContent(content string) {
	fmt.Fprint(os.Stdout, content)
	if !strings.HasSuffix(content, "\n") {
		fmt.Println()
	}
}

func readContentFile(command *cobra.Command) (string, error) {
	filePath, err := command.Flags().GetString("file")
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(filePath) == "-" {
		payload, readErr := io.ReadAll(command.InOrStdin())
		if readErr != nil {
			return "", fmt.Errorf("read content from stdin: %w", readErr)
		}
		return string(payload), nil
	}
	payload, readErr := os.ReadFile(filePath)
	if readErr != nil {
		return "", fmt.Errorf("read content file: %w", readErr)
	}
	return string(payload), nil
}
