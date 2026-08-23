package cmd

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/platform/config"
)

var taskCmd = &cobra.Command{
	Use:   "task",
	Short: "Manage local tasks",
}

var taskImportLegacyCmd = &cobra.Command{
	Use:   "import-legacy",
	Short: "Import legacy file-based tasks for one project",
	Long: `Import legacy task metadata from a workspace's .my-context symlink into the local task database.
The command does not move, copy, or modify legacy Task Context files.`,
	Args: cobra.NoArgs,
	RunE: runImportLegacyTasks,
}

func runImportLegacyTasks(command *cobra.Command, _ []string) error {
	worktreePath, projectID, err := readLegacyImportFlags(command)
	if err != nil {
		return err
	}
	contextRoot, err := resolveLegacyImportContextRoot(worktreePath)
	if err != nil {
		return err
	}
	database, err := openLocalTaskDatabase()
	if err != nil {
		return err
	}
	defer database.Close()
	return importLegacyProjectTasks(command, database, contextRoot, projectID)
}

func readLegacyImportFlags(command *cobra.Command) (string, string, error) {
	worktreePath, err := command.Flags().GetString("worktree")
	if err != nil {
		return "", "", err
	}
	projectID, err := command.Flags().GetString("project-id")
	if err != nil {
		return "", "", err
	}
	if strings.TrimSpace(worktreePath) == "" || strings.TrimSpace(projectID) == "" {
		return "", "", errors.New("--worktree and --project-id are required")
	}
	return worktreePath, projectID, nil
}

func resolveLegacyImportContextRoot(worktreePath string) (string, error) {
	contextRoot, err := filepath.EvalSymlinks(filepath.Join(worktreePath, ".my-context"))
	if err != nil {
		return "", fmt.Errorf("resolve workspace .my-context: %w", err)
	}
	return contextRoot, nil
}

func openLocalTaskDatabase() (*sql.DB, error) {
	dataDir, err := config.ResolveAccountDataDir(appConfig.ConfigPath)
	if err != nil {
		return nil, err
	}
	database, err := sqlite.Open(dataDir)
	if err != nil {
		return nil, err
	}
	if err := sqlite.Migrate(database); err != nil {
		_ = database.Close()
		return nil, err
	}
	return database, nil
}

func importLegacyProjectTasks(command *cobra.Command, database *sql.DB, contextRoot string, projectID string) error {
	isComplete, err := sqlite.LocalTaskLegacyImportCompleted(context.Background(), database, projectID)
	if err != nil {
		return err
	}
	if isComplete {
		return fmt.Errorf("legacy tasks for project %q were already imported", projectID)
	}
	store := sqlite.NewLocalTaskStore(database)
	if err := localtask.ImportLegacyProjectTasks(context.Background(), store, contextRoot, projectID); err != nil {
		return err
	}
	if err := sqlite.MarkLocalTaskLegacyImportCompleted(context.Background(), database, projectID); err != nil {
		return err
	}
	_, err = fmt.Fprintln(command.OutOrStdout(), "Legacy tasks imported successfully.")
	return err
}

func init() {
	taskImportLegacyCmd.Flags().String("worktree", "", "Local workspace worktree path containing .my-context")
	taskImportLegacyCmd.Flags().String("project-id", "", "Project ID to assign to imported tasks")
	taskCmd.AddCommand(taskImportLegacyCmd)
	rootCmd.AddCommand(taskCmd)
}
