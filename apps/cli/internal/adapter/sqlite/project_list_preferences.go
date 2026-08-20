package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// ProjectListPreferencesVersion is the current persisted shape version.
// Bump it when the JSON contract changes so consumers can migrate.
const ProjectListPreferencesVersion = 1

// projectListPreferencesKey returns the _metadata key holding one
// organization's left-pane list preferences.
func projectListPreferencesKey(organizationID string) string {
	return "project_list_preferences:" + organizationID
}

// ProjectListModePreference holds one hierarchy mode's order/fold state.
// Lists are order hints: ids absent from a list are implicitly last, and
// stale ids are tolerated by consumers and preserved on read. Workspace order
// is intentionally shared across modes (the same workspaces hang under the
// same project+node groups
// in both hierarchy modes).
type ProjectListModePreference struct {
	ProjectOrderIds     []string            `json:"projectOrderIds"`
	NodeOrderByParentId map[string][]string `json:"nodeOrderByParentId"`
	FoldedProjectIds    []string            `json:"foldedProjectIds"`
	FoldedNodeKeys      []string            `json:"foldedNodeKeys"`
}

// ProjectListPreference is one organization's persisted left-pane list state.
// WorkspaceOrderByParentId is shared across hierarchy modes: it keys workspace
// order by projectId:nodeId, and both by_project and by_node display the same
// workspaces under the same project+node groups.
type ProjectListPreference struct {
	Version                  int                       `json:"version"`
	ByProject                ProjectListModePreference `json:"by_project"`
	ByNode                   ProjectListModePreference `json:"by_node"`
	WorkspaceOrderByParentId map[string][]string       `json:"workspaceOrderByParentId"`
}

// ProjectListPreferenceStore persists per-org left-pane list order/fold
// state in the _metadata key-value table, keeping entity tables untouched.
type ProjectListPreferenceStore struct {
	database *sql.DB
}

// NewProjectListPreferenceStore creates a store backed by database.
func NewProjectListPreferenceStore(database *sql.DB) *ProjectListPreferenceStore {
	return &ProjectListPreferenceStore{database: database}
}

// Get returns the org's persisted preferences. Missing or corrupt persisted
// state returns empty defaults so consumers can rely on a valid shape. Order
// hints are remote-authoritative and remain unchanged, including stale IDs.
func (store *ProjectListPreferenceStore) Get(ctx context.Context, organizationID string) (ProjectListPreference, error) {
	preference := ProjectListPreference{Version: ProjectListPreferencesVersion}
	if organizationID == "" {
		return preference, nil
	}

	raw, ok, err := getMetadataKey(ctx, store.database, projectListPreferencesKey(organizationID))
	if err != nil {
		return ProjectListPreference{}, fmt.Errorf("read project list preferences: %w", err)
	}
	if !ok {
		return preference, nil
	}

	var stored ProjectListPreference
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		// Corrupt persisted state is treated as absent; the next Set
		// replaces it with a clean snapshot.
		return preference, nil
	}
	// A blob written by a newer binary is left untouched: reading it as the
	// current version would misinterpret fields, and the next Set would
	// overwrite it. Return defaults so the caller never corrupts unknown data.
	if stored.Version != 0 && stored.Version != ProjectListPreferencesVersion {
		return preference, nil
	}
	stored.Version = ProjectListPreferencesVersion
	if stored.WorkspaceOrderByParentId == nil {
		migrateLegacyWorkspaceOrder([]byte(raw), &stored)
	}
	return stored, nil
}

// Set upserts the org's preferences, replacing the whole org blob.
func (store *ProjectListPreferenceStore) Set(ctx context.Context, organizationID string, preference ProjectListPreference) error {
	if organizationID == "" {
		return fmt.Errorf("set project list preferences: organization id is required")
	}
	preference.Version = ProjectListPreferencesVersion
	raw, err := json.Marshal(preference)
	if err != nil {
		return fmt.Errorf("marshal project list preferences: %w", err)
	}
	if err := setMetadataKey(ctx, store.database, projectListPreferencesKey(organizationID), string(raw)); err != nil {
		return fmt.Errorf("write project list preferences: %w", err)
	}
	return nil
}

// migrateLegacyWorkspaceOrder merges the per-mode workspace order written by
// early builds (before workspace order became shared across hierarchy modes)
// into the shared top-level bucket. On key conflicts by_node overlays
// by_project; each mode only had entries for groups the user reordered in
// that mode, so the merge deterministically keeps every edited group's order.
func migrateLegacyWorkspaceOrder(raw []byte, preference *ProjectListPreference) {
	var legacy struct {
		ByProject map[string]json.RawMessage `json:"by_project"`
		ByNode    map[string]json.RawMessage `json:"by_node"`
	}
	if err := json.Unmarshal(raw, &legacy); err != nil {
		return
	}
	extract := func(mode map[string]json.RawMessage) map[string][]string {
		rawList, ok := mode["workspaceOrderByParentId"]
		if !ok {
			return nil
		}
		var ids map[string][]string
		if err := json.Unmarshal(rawList, &ids); err != nil {
			return nil
		}
		return ids
	}
	merged := make(map[string][]string)
	for key, ids := range extract(legacy.ByProject) {
		merged[key] = ids
	}
	for key, ids := range extract(legacy.ByNode) {
		merged[key] = ids
	}
	if len(merged) > 0 {
		preference.WorkspaceOrderByParentId = merged
	}
}
