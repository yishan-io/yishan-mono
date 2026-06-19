package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"

	daemonpkg "yishan/apps/cli/internal/daemon"
	"yishan/apps/cli/internal/memory"
)

var personaCmd = &cobra.Command{
	Use:   "persona",
	Short: "Manage your global developer persona",
	Long:  `View, refresh, or clear the global developer persona stored at ~/.yishan/memory/PERSONA.md.`,
}

var personaShowCmd = &cobra.Command{
	Use:   "show",
	Short: "Print current PERSONA.md",
	Long:  `Print the contents of ~/.yishan/memory/PERSONA.md to stdout.`,
	RunE: func(_ *cobra.Command, _ []string) error {
		path, err := memory.PersonaFilePath()
		if err != nil {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				fmt.Println("No persona file found. Run 'yishan setup' to create the initial template,")
				fmt.Println("or wait for the first daily batch extraction after your next session.")
				return nil
			}
			return fmt.Errorf("read persona file: %w", err)
		}
		fmt.Print(string(data))
		return nil
	},
}

var personaRefreshCmd = &cobra.Command{
	Use:   "refresh",
	Short: "Force-run daily batch extraction now",
	Long: `Run persona extraction for yesterday's sessions immediately, ignoring the date gate.
Useful for testing or after manually editing PERSONA.md.

Requires the summarizer to be configured (memory.summarizer.enabled = true in profile settings).`,
	RunE: func(cobraCmd *cobra.Command, _ []string) error {
		if !appConfig.Memory.SummarizerEnabled {
			return fmt.Errorf("persona summarizer is not enabled — set memory.summarizer.enabled = true in your profile settings")
		}

		cfg := memory.SummarizerConfig{
			Enabled:   appConfig.Memory.SummarizerEnabled,
			AgentKind: appConfig.Memory.SummarizerAgentKind,
			Model:     appConfig.Memory.SummarizerModel,
		}
		ps := memory.NewPersonaSummarizer(cfg, daemonpkg.BuildRunAgentFunc())
		if !ps.Enabled() {
			return fmt.Errorf("persona summarizer is not ready — check memory.summarizer configuration")
		}

		agent, _ := cobraCmd.Flags().GetString("agent")
		if agent == "" {
			agent = "opencode"
		}

		yesterday := time.Now().UTC().AddDate(0, 0, -1)
		reader := memory.NewAgentDBReaderForCLI()
		sessions, err := reader.ReadSessionsForDate(agent, yesterday)
		if err != nil {
			return fmt.Errorf("read sessions for %s on %s: %w", agent, yesterday.Format("2006-01-02"), err)
		}
		if len(sessions) == 0 {
			fmt.Printf("No sessions found for agent %q on %s\n", agent, yesterday.Format("2006-01-02"))
			return nil
		}

		fmt.Printf("Found %d session(s) for agent %q on %s — extracting persona...\n",
			len(sessions), agent, yesterday.Format("2006-01-02"))

		result, err := ps.SummarizeForPersona(agent, sessions)
		if err != nil {
			return fmt.Errorf("persona extraction failed: %w", err)
		}
		if result.Skipped {
			fmt.Println("Extraction skipped (no content found).")
			return nil
		}
		fmt.Printf("Persona updated: %s\n", result.WrittenPath)
		return nil
	},
}

var personaClearCmd = &cobra.Command{
	Use:   "clear",
	Short: "Clear PERSONA.md content",
	Long: `Reset PERSONA.md to an empty template (keeps the file, empties all sections).
The file will be re-populated automatically by future daily batch extractions.`,
	RunE: func(_ *cobra.Command, _ []string) error {
		path, err := memory.PersonaFilePath()
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return fmt.Errorf("create persona dir: %w", err)
		}
		empty := memory.BuildEmptyPersonaMarkdown()
		if err := os.WriteFile(path, []byte(empty), 0o644); err != nil {
			return fmt.Errorf("clear persona file: %w", err)
		}
		fmt.Printf("Persona cleared: %s\n", path)
		return nil
	},
}

func init() {
	personaRefreshCmd.Flags().String("agent", "opencode", "Agent kind to extract sessions from (opencode or claude)")

	personaCmd.AddCommand(personaShowCmd)
	personaCmd.AddCommand(personaRefreshCmd)
	personaCmd.AddCommand(personaClearCmd)

	rootCmd.AddCommand(personaCmd)
}
