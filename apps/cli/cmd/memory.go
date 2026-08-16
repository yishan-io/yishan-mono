package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/cmd/output"
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
	Long:  `Search the FTS5 memory index. Open read-only — run 'yishan memory reconcile' separately to refresh the index.`,
	Example: `  yishan memory search --output json "permission deadlock"
  yishan memory search --output json --scope global "coding style"
  yishan memory search --output json --project-id proj_abc123 "auth"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cobraCmd *cobra.Command, args []string) error {
		db, err := openMemoryForSearch()
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
// The workspace data is stored in the profile's SQLite database.
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

// openMemoryForSearch opens the memory DB read-only for searching.
// It does not reconcile or write to the DB, so it is safe for sandboxed
// environments. If the DB file does not exist, it returns an error prompting
// the user to run 'yishan memory reconcile' first.
func openMemoryForSearch() (*memory.DB, error) {
	dbPath, err := resolveMemoryDBPath()
	if err != nil {
		return nil, err
	}

	if _, err := os.Stat(dbPath); err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("no memory index found — run 'yishan memory reconcile' first to build the index")
		}
		return nil, fmt.Errorf("check memory database: %w", err)
	}

	db, err := memory.OpenReadOnly(dbPath)
	if err != nil {
		return nil, err
	}

	return db, nil
}

// readProfileWorkspaceRefs reads local workspaces for the current profile from SQLite.
// The workspace DB lives in the account data dir, not the env root.
func readProfileWorkspaceRefs() ([]memory.WorkspaceRef, error) {
	dataDir, err := config.ResolveAccountDataDir(appConfig.ConfigPath)
	if err != nil {
		return nil, err
	}
	database, err := sqlite.OpenReadOnly(dataDir)
	if err != nil {
		return nil, err
	}
	defer database.Close()
	workspaceStore := sqlite.NewWorkspaceStore(database)
	dbWorkspaces, err := workspaceStore.List(context.Background())
	if err != nil {
		return nil, err
	}
	refs := make([]memory.WorkspaceRef, 0, len(dbWorkspaces))
	for _, ws := range dbWorkspaces {
		if ws.LocalPath != "" {
			refs = append(refs, memory.WorkspaceRef{
				WorktreePath: ws.LocalPath,
				ProjectID:    ws.ProjectID,
			})
		}
	}
	return refs, nil
}

func resolveMemoryDBPath() (string, error) {
	dataDir, err := config.ResolveAccountDataDir(appConfig.ConfigPath)
	if err != nil {
		return "", err
	}
	return filepath.Join(dataDir, "memory", "memory.db"), nil
}

func init() {
	memorySearchCmd.Flags().String("project-id", "", "Limit search to a specific project ID")
	memorySearchCmd.Flags().String("scope", "", "Limit to project or global scope")
	memorySearchCmd.Flags().Int("limit", 20, "Maximum number of results")

	memoryCmd.AddCommand(memoryReconcileCmd)
	memoryCmd.AddCommand(memorySearchCmd)

	rootCmd.AddCommand(memoryCmd)
}
