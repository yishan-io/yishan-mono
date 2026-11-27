package scheduledjob

import (
	"context"
	"fmt"
	"time"

	"yishan/apps/cli/internal/adapter/sqlite"
	domain "yishan/apps/cli/internal/scheduledjob"

	"github.com/rs/zerolog/log"
)

const (
	importMarkerPrefix = "scheduled_job_import_v1:"
	importRunLimit     = 20
	importTimeout      = time.Minute
)

// ImportFromAPI copies, once per organization, the scheduled jobs that
// api-service still holds for this node, with their recent runs. Jobs whose
// project is not on this machine are skipped. Failed organizations get no
// marker and are retried on the next daemon start.
func (s *Service) ImportFromAPI(ctx context.Context) {
	if s.deps.Session == nil || !s.deps.Session.APIConfigured() || s.deps.Database == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, importTimeout)
	defer cancel()
	organizations, err := s.deps.Session.APIClient().ListOrganizationsContext(ctx)
	if err != nil {
		log.Warn().Err(err).Msg("scheduled job import: list organizations failed; will retry")
		return
	}
	imported := 0
	for _, organization := range organizations.Organizations {
		count, err := s.importOrganization(ctx, organization.ID)
		if err != nil {
			log.Warn().Err(err).Str("orgId", organization.ID).Msg("scheduled job import failed; will retry")
			continue
		}
		imported += count
	}
	if imported > 0 {
		log.Info().Int("jobs", imported).Msg("imported scheduled jobs from api-service")
		s.scheduleChanged()
	}
}

func (s *Service) importOrganization(ctx context.Context, organizationID string) (int, error) {
	markerKey := importMarkerPrefix + organizationID
	if done, err := sqlite.MetadataKeyExists(ctx, s.deps.Database, markerKey); err != nil || done {
		return 0, err
	}
	if s.deps.EnsureProjectsImported != nil {
		s.deps.EnsureProjectsImported(ctx, organizationID)
	}
	jobs, runs, err := s.fetchOrganization(ctx, organizationID)
	if err != nil {
		return 0, err
	}
	if err := s.store().ImportJobs(ctx, jobs, runs); err != nil {
		return 0, fmt.Errorf("store imported scheduled jobs: %w", err)
	}
	if err := sqlite.SetMetadataKey(ctx, s.deps.Database, markerKey, domain.FormatTime(s.now())); err != nil {
		return 0, fmt.Errorf("record scheduled job import marker: %w", err)
	}
	return len(jobs), nil
}

func (s *Service) fetchOrganization(ctx context.Context, organizationID string) ([]domain.Job, []domain.Run, error) {
	client := s.deps.Session.APIClient()
	remote, err := client.ListScheduledJobsContext(ctx, organizationID)
	if err != nil {
		return nil, nil, fmt.Errorf("list remote scheduled jobs: %w", err)
	}
	projects := sqlite.NewProjectStore(s.deps.Database)
	jobs, runs := make([]domain.Job, 0, len(remote)), make([]domain.Run, 0)
	for _, job := range remote {
		if job.NodeID != s.deps.NodeID {
			continue
		}
		if _, err := projects.Get(ctx, job.ProjectID); err != nil {
			continue
		}
		jobRuns, err := client.ListScheduledJobRunsContext(ctx, organizationID, job.ID, importRunLimit)
		if err != nil {
			return nil, nil, fmt.Errorf("list remote runs of scheduled job %q: %w", job.ID, err)
		}
		jobs, runs = append(jobs, normalizeImportedJob(job)), append(runs, jobRuns...)
	}
	return jobs, runs, nil
}

// normalizeImportedJob rewrites api-service timestamps into the local format
// so stored values compare lexically.
func normalizeImportedJob(job domain.Job) domain.Job {
	for _, value := range []*string{&job.NextRunAt, &job.CreatedAt, &job.UpdatedAt} {
		if parsed, err := domain.ParseTime(*value); err == nil {
			*value = domain.FormatTime(parsed)
		}
	}
	for _, value := range []*string{job.LastScheduledFor, job.LastRunAt} {
		if value == nil {
			continue
		}
		if parsed, err := domain.ParseTime(*value); err == nil {
			*value = domain.FormatTime(parsed)
		}
	}
	return job
}
