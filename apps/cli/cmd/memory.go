package cmd

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"yishan/apps/cli/internal/config"
	daemonpkg "yishan/apps/cli/internal/daemon"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/output"
)

var memoryCmd = &cobra.Command{
	Use:   "memory",
	Short: "Manage project memory",
	Long:  `Search, reconcile, and manage project memory indexed from .my-context/ files.`,
}

var memoryReconcileCmd = &cobra.Command{
	Use:   "reconcile",
	Short: "Reconcile memory index with disk files",
	Long: `Re-index the memory index from the profile's known workspaces.
Reads the workspace index written by the daemon — no running daemon required.`,
	Example: `  yishan memory reconcile`,
	RunE: func(_ *cobra.Command, _ []string) error {
		db, err := openAndReconcileMemoryDB()
		if err != nil {
			return err
		}
		defer db.Close()
		return output.PrintAny(map[string]string{"status": "reconciled"})
	},
}

var memorySearchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search project memory",
	Long:  `Search the FTS5 memory index. Reconciles from the profile's known workspaces before searching.`,
	Example: `  yishan memory search --output json "permission deadlock"
  yishan memory search --output json --scope global "coding style"
  yishan memory search --output json --project-id proj_abc123 "auth"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cobraCmd *cobra.Command, args []string) error {
		db, err := openAndReconcileMemoryDB()
		if err != nil {
			return err
		}
		defer db.Close()

		query := args[0]
		projectID, _ := cobraCmd.Flags().GetString("project-id")
		scope, _ := cobraCmd.Flags().GetString("scope")
		limit, _ := cobraCmd.Flags().GetInt("limit")

		results, err := db.SearchMemory(memory.SearchInput{
			Query:     query,
			ProjectID: projectID,
			Scope:     scope,
			Limit:     limit,
		})
		if err != nil {
			return err
		}
		if results == nil {
			results = []memory.MemorySearchResult{}
		}
		return output.PrintAny(results)
	},
}

// openAndReconcileMemoryDB opens the profile-scoped memory DB, reconciles it
// from the profile's workspace index, then returns the handle for querying.
//
// The workspace index (~/.yishan/profiles/<profile>/workspace-index.json) is
// written by the daemon on every workspace open/close. Reading it here means
// we always index exactly the workspaces that were opened under this profile —
// no running daemon required.
func openAndReconcileMemoryDB() (*memory.DB, error) {
	dbPath, err := resolveMemoryDBPath()
	if err != nil {
		return nil, err
	}
	db, err := memory.OpenDB(dbPath)
	if err != nil {
		return nil, err
	}

	refs, err := readProfileWorkspaceRefs()
	if err != nil {
		log.Warn().Err(err).Msg("could not read workspace index, memory may be incomplete")
		refs = nil
	}

	globalDir, _ := memory.GlobalMemoryDir()
	result, err := db.Reconcile(refs, globalDir)
	if err != nil {
		log.Warn().Err(err).Msg("memory reconcile failed, search may be incomplete")
	} else {
		log.Debug().
			Int("inserted", result.Inserted).
			Int("updated", result.Updated).
			Int("deleted", result.Deleted).
			Msg("memory reconciled")
	}

	return db, nil
}

// readProfileWorkspaceRefs reads workspace-index.json for the current profile
// and returns the workspace refs recorded there by the daemon.
func readProfileWorkspaceRefs() ([]memory.WorkspaceRef, error) {
	statePath, err := daemonpkg.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return nil, err
	}
	indexPath := daemonpkg.WorkspaceIndexPath(statePath)

	raw, err := os.ReadFile(indexPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // no workspaces opened yet for this profile
		}
		return nil, err
	}

	var file struct {
		Entries []struct {
			WorktreePath string `json:"worktreePath"`
			ProjectID    string `json:"projectId"`
		} `json:"entries"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		return nil, err
	}

	refs := make([]memory.WorkspaceRef, 0, len(file.Entries))
	for _, e := range file.Entries {
		if e.WorktreePath != "" {
			refs = append(refs, memory.WorkspaceRef{
				WorktreePath: e.WorktreePath,
				ProjectID:    e.ProjectID,
			})
		}
	}
	return refs, nil
}

func resolveMemoryDBPath() (string, error) {
	yishanHome, err := config.HomeDir()
	if err != nil {
		return "", err
	}
	profile := viper.GetString("profile")
	if profile == "" {
		profile = "default"
	}
	return filepath.Join(yishanHome, "profiles", profile, "memory.db"), nil
}

func init() {
	memorySearchCmd.Flags().String("project-id", "", "Limit search to a specific project ID")
	memorySearchCmd.Flags().String("scope", "", "Limit to project or global scope")
	memorySearchCmd.Flags().Int("limit", 20, "Maximum number of results")

	memoryCmd.AddCommand(memoryReconcileCmd)
	memoryCmd.AddCommand(memorySearchCmd)

	rootCmd.AddCommand(memoryCmd)
}
