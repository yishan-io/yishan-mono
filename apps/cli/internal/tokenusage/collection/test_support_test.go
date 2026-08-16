package collection

import (
	"context"
	"time"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/tokenusage/repository"
	"yishan/apps/cli/internal/tokenusage/scanner"
	"yishan/apps/cli/internal/workspace/instance"
)

// stubHourlyUsageRepository satisfies repository.HourlyUsageRepository with
// empty behavior; tests override individual methods via embedding.
type stubHourlyUsageRepository struct {
	state sqlite.HourlyUsageSyncState
}

func (s *stubHourlyUsageRepository) ReplaceAgentHourlyRows(_ context.Context, _ string, _ []sqlite.HourlyUsageRow) error {
	return nil
}

func (s *stubHourlyUsageRepository) ListDirtyHourlyRows(_ context.Context) ([]sqlite.HourlyUsageRow, error) {
	return nil, nil
}

func (s *stubHourlyUsageRepository) MarkHourlyRowsSynced(_ context.Context, _ []sqlite.HourlyUsageRow, _ int64) error {
	return nil
}

func (s *stubHourlyUsageRepository) GetHourlyUsageSyncState(_ context.Context) (sqlite.HourlyUsageSyncState, error) {
	return s.state, nil
}

// countingHourlyUsageRepository records replace calls so tests can assert
// replacement (not append) semantics.
type countingHourlyUsageRepository struct {
	stubHourlyUsageRepository
	replaceCalls int
	lastRows     []sqlite.HourlyUsageRow
}

func (s *countingHourlyUsageRepository) ReplaceAgentHourlyRows(ctx context.Context, agentKind string, rows []sqlite.HourlyUsageRow) error {
	s.replaceCalls++
	s.lastRows = rows
	return nil
}

// failingReplaceRepository fails the row replacement once so tests can cover
// the scan-failure and rerun paths.
type failingReplaceRepository struct {
	stubHourlyUsageRepository
	failuresRemaining int
	replaceCalls      int
}

func (s *failingReplaceRepository) ReplaceAgentHourlyRows(ctx context.Context, agentKind string, rows []sqlite.HourlyUsageRow) error {
	s.replaceCalls++
	if s.failuresRemaining > 0 {
		s.failuresRemaining--
		return errTestScanFailure
	}
	return nil
}

// dirtyRowRepository returns pre-set dirty rows and records mark-synced
// calls per org so tests can assert partial-sync semantics.
type dirtyRowRepository struct {
	stubHourlyUsageRepository
	dirtyRows   []sqlite.HourlyUsageRow
	syncedOrgs  []string
	syncedCount int
}

func (s *dirtyRowRepository) ListDirtyHourlyRows(_ context.Context) ([]sqlite.HourlyUsageRow, error) {
	return s.dirtyRows, nil
}

func (s *dirtyRowRepository) GetHourlyUsageSyncState(_ context.Context) (sqlite.HourlyUsageSyncState, error) {
	return sqlite.HourlyUsageSyncState{DirtyRows: len(s.dirtyRows), TotalRows: len(s.dirtyRows)}, nil
}

func (s *dirtyRowRepository) MarkHourlyRowsSynced(_ context.Context, rows []sqlite.HourlyUsageRow, _ int64) error {
	if len(rows) == 0 {
		return nil
	}
	s.syncedOrgs = append(s.syncedOrgs, rows[0].OrganizationID)
	s.syncedCount += len(rows)
	return nil
}

// newTestCollector builds a collector wired for scan-path tests: an empty
// registry, no runtime, the default scanner registry, and the given
// repository. Timers are initialized so trigger paths do not nil-map panic.
func newTestCollector(repo repository.HourlyUsageRepository) *Collector {
	return &Collector{
		registry:             instance.NewRegistry(files.NewFileService()),
		repo:                 repo,
		scanners:             scanner.DefaultRegistry(),
		timers:               make(map[string]*time.Timer),
		inFlight:             make(map[string]bool),
		needsRerun:           make(map[string]bool),
		recoverySinceByAgent: make(map[string]int64),
		pending:              make(map[string][]sqlite.HourlyUsageRow),
	}
}
