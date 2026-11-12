package cmd

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"yishan/apps/cli/cmd/output"
	"yishan/apps/cli/internal/memory"
)

var memoryReadCmd = &cobra.Command{
	Use:   "read <path>",
	Short: "Read one durable memory file",
	Long: `Read one file under the project's .my-context directory.

The path is relative to .my-context/ and must stay inside it. The project root
comes from --project-root or the nearest ancestor of the working directory that
contains .my-context or .git.`,
	Example: `  yishan memory read MEMORY.md
  yishan memory read architecture/db.md --project-root ~/code/app --output json`,
	Args: cobra.ExactArgs(1),
	RunE: runMemoryRead,
}

var memoryStoreCmd = &cobra.Command{
	Use:   "store",
	Short: "Store one durable memory entry in MEMORY.md",
	Long: `Append one entry to a MEMORY.md section under the cross-process memory lock.

Entries are appended at the end of the section in chronological order. Run
"yishan memory reconcile" afterwards to make the new entry searchable; search
never rebuilds the index itself.`,
	Example: `  yishan memory store --section locked_decisions --entry "Prefer CLI over MCP first. Why: one shared implementation."
  yishan memory store --section durable_discoveries --file - < discovery.md`,
	Args: cobra.NoArgs,
	RunE: runMemoryStore,
}

func runMemoryRead(command *cobra.Command, args []string) error {
	memoryRoot, err := resolveCommandMemoryRoot(command)
	if err != nil {
		return err
	}
	content, err := memory.ReadMemoryFile(memoryRoot, args[0])
	if err != nil {
		return err
	}
	if output.IsJSONOutput() {
		return output.PrintAny(map[string]any{"path": args[0], "content": content})
	}
	printContent(content)
	return nil
}

func runMemoryStore(command *cobra.Command, _ []string) error {
	projectRoot, err := resolveCommandProjectRoot(command)
	if err != nil {
		return err
	}
	section, err := readMemorySection(command)
	if err != nil {
		return err
	}
	entry, err := readContentInput(command, "entry")
	if err != nil {
		return err
	}
	date, err := readMemoryEntryDate(command)
	if err != nil {
		return err
	}
	memoryPath, err := memory.StoreMemoryEntry(projectRoot, section, entry, date)
	if err != nil {
		return err
	}
	return output.PrintAny(map[string]any{
		"status":  "stored",
		"path":    memoryPath,
		"section": string(section),
		"date":    date,
	})
}

func resolveCommandProjectRoot(command *cobra.Command) (string, error) {
	projectRoot, err := command.Flags().GetString("project-root")
	if err != nil {
		return "", err
	}
	workingDirectory, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("resolve working directory: %w", err)
	}
	return memory.ResolveProjectRoot(projectRoot, workingDirectory)
}

func resolveCommandMemoryRoot(command *cobra.Command) (string, error) {
	projectRoot, err := resolveCommandProjectRoot(command)
	if err != nil {
		return "", err
	}
	return memory.ResolveProjectMemoryRoot(projectRoot)
}

func readMemorySection(command *cobra.Command) (memory.MemorySection, error) {
	raw, err := command.Flags().GetString("section")
	if err != nil {
		return "", err
	}
	section := memory.MemorySection(strings.TrimSpace(raw))
	switch section {
	case memory.MemorySectionDecisions, memory.MemorySectionDiscoveries:
		return section, nil
	default:
		return "", newUsageError("--section %q must be locked_decisions or durable_discoveries", raw)
	}
}

// readMemoryEntryDate defaults to today's UTC date; an explicit date is validated.
func readMemoryEntryDate(command *cobra.Command) (string, error) {
	raw, err := command.Flags().GetString("date")
	if err != nil {
		return "", err
	}
	date := strings.TrimSpace(raw)
	if date == "" {
		return time.Now().UTC().Format("2006-01-02"), nil
	}
	if _, parseErr := time.Parse("2006-01-02", date); parseErr != nil {
		return "", newUsageError("--date %q must be YYYY-MM-DD", raw)
	}
	return date, nil
}

// registerMemoryReadFlags registers the memory read flags.
func registerMemoryReadFlags(command *cobra.Command) {
	command.Flags().String("project-root", "", "project root containing .my-context")
}

// registerMemoryStoreFlags registers the memory store flags.
func registerMemoryStoreFlags(command *cobra.Command) {
	command.Flags().String("project-root", "", "project root containing .my-context")
	command.Flags().String("section", "", "MEMORY.md section: locked_decisions or durable_discoveries")
	command.Flags().String("entry", "", "memory entry text")
	command.Flags().String("file", "", "read the entry from a file, or - for stdin")
	command.Flags().String("date", "", "entry date in YYYY-MM-DD (defaults to today, UTC)")
}

func init() {
	memoryCmd.AddCommand(memoryReadCmd, memoryStoreCmd)
	registerMemoryReadFlags(memoryReadCmd)
	registerMemoryStoreFlags(memoryStoreCmd)
}
