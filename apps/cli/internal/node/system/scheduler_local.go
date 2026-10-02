package system

import (
	"context"
	"errors"
	"sync"
	"time"
)

const (
	localSchedulerDueCutoff         = time.Minute
	localSchedulerReconcileInterval = time.Hour
)

var errLocalSchedulerCallbacks = errors.New("local scheduler requires reconcile, claim, and execute callbacks")

// LocalScheduledJob is the active job occurrence that may be armed locally.
type LocalScheduledJob struct {
	ID        string
	Status    string
	NextRunAt time.Time
}

// LocalSchedulerSnapshot reconciles the authoritative schedule while protecting local occurrences.
type LocalSchedulerSnapshot func(context.Context, []LocalScheduledJob) ([]LocalScheduledJob, error)

// LocalSchedulerClaim atomically claims the expected occurrence and returns its next occurrence and run payload.
type LocalSchedulerClaim func(context.Context, string, time.Time) (LocalSchedulerClaimResult, error)

// LocalSchedulerClaimResult contains the next occurrence and its concrete execution payload.
type LocalSchedulerClaimResult struct {
	JobID        string
	RunID        string
	ScheduledFor time.Time
	Agent        string
	Prompt       string
	Model        string
	ProjectPath  string
	NextRunAt    time.Time
}

// LocalSchedulerExecute performs the potentially long-running claimed work.
type LocalSchedulerExecute func(context.Context, LocalSchedulerClaimResult)

// LocalSchedulerOptions configures the lifecycle-bound local scheduler.
type LocalSchedulerOptions struct {
	Snapshot          LocalSchedulerSnapshot
	Claim             LocalSchedulerClaim
	Execute           LocalSchedulerExecute
	MaxConcurrent     int
	Now               func() time.Time
	ReconcileInterval time.Duration
}

// LocalScheduler owns future-only timers for the current daemon lifetime.
type LocalScheduler struct {
	ctx               context.Context
	cancel            context.CancelFunc
	snapshot          LocalSchedulerSnapshot
	claim             LocalSchedulerClaim
	execute           LocalSchedulerExecute
	now               func() time.Time
	reconcileInterval time.Duration
	dueJobs           chan LocalScheduledJob
	scheduleChanged   chan struct{}

	mu                sync.Mutex
	api               sync.Mutex
	start             sync.Mutex
	closed            bool
	started           bool
	armed             map[string]time.Time
	claiming          map[string]LocalScheduledJob
	running           map[string]bool
	reconcileRequests chan struct{}
	reconcileStarted  chan struct{}
	closeOnce         sync.Once
	workers           sync.WaitGroup
}

// NewLocalScheduler constructs a scheduler without starting reconciliation.
func NewLocalScheduler(options LocalSchedulerOptions) (*LocalScheduler, error) {
	if options.Snapshot == nil || options.Claim == nil || options.Execute == nil {
		return nil, errLocalSchedulerCallbacks
	}
	if options.MaxConcurrent < 1 {
		options.MaxConcurrent = 1
	}
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.ReconcileInterval <= 0 {
		options.ReconcileInterval = localSchedulerReconcileInterval
	}
	ctx, cancel := context.WithCancel(context.Background())
	scheduler := &LocalScheduler{ctx: ctx, cancel: cancel, snapshot: options.Snapshot, claim: options.Claim,
		execute: options.Execute, now: options.Now, reconcileInterval: options.ReconcileInterval,
		dueJobs: make(chan LocalScheduledJob, options.MaxConcurrent), scheduleChanged: make(chan struct{}, 1),
		armed: make(map[string]time.Time), claiming: make(map[string]LocalScheduledJob), running: make(map[string]bool),
		reconcileRequests: make(chan struct{}, 1), reconcileStarted: make(chan struct{})}
	scheduler.workers.Add(options.MaxConcurrent + 3)
	go scheduler.reconcileRequestsLoop()
	go scheduler.reconcileLoop()
	go scheduler.dueCoordinator()
	for range options.MaxConcurrent {
		go scheduler.dueWorker()
	}
	return scheduler, nil
}

// Start reconciles the startup snapshot and starts safety reconciliation.
func (s *LocalScheduler) Start() error {
	s.start.Lock()
	defer s.start.Unlock()
	if s.isStartedOrClosed() {
		return nil
	}
	if err := s.Refresh(); err != nil {
		s.Close()
		return err
	}
	s.mu.Lock()
	if !s.closed {
		s.started = true
		close(s.reconcileStarted)
	}
	s.mu.Unlock()
	return nil
}

func (s *LocalScheduler) isStartedOrClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.started || s.closed
}

// Refresh reconciles armed and claiming occurrences with the authoritative API schedule.
func (s *LocalScheduler) Refresh() error {
	s.api.Lock()
	defer s.api.Unlock()
	if s.isClosed() {
		return nil
	}
	jobs, err := s.snapshot(s.ctx, s.protectedJobs())
	if err != nil || s.ctx.Err() != nil {
		return err
	}
	s.applySnapshot(jobs)
	return nil
}

func (s *LocalScheduler) protectedJobs() []LocalScheduledJob {
	s.mu.Lock()
	defer s.mu.Unlock()
	jobs := make([]LocalScheduledJob, 0, len(s.armed)+len(s.claiming))
	for jobID, due := range s.armed {
		jobs = append(jobs, LocalScheduledJob{ID: jobID, Status: "active", NextRunAt: due})
	}
	for _, job := range s.claiming {
		jobs = append(jobs, job)
	}
	return jobs
}

func (s *LocalScheduler) applySnapshot(jobs []LocalScheduledJob) {
	future := make(map[string]time.Time, len(jobs))
	for _, job := range jobs {
		if job.ID != "" && job.Status == "active" && job.NextRunAt.After(s.now()) {
			future[job.ID] = job.NextRunAt
		}
	}
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	for jobID, due := range s.armed {
		if nextDue, exists := future[jobID]; !exists || !nextDue.Equal(due) {
			delete(s.armed, jobID)
		}
	}
	for jobID, due := range future {
		if _, isClaiming := s.claiming[jobID]; !isClaiming {
			s.armDueLocked(jobID, due)
		}
	}
	s.mu.Unlock()
	s.signalScheduleChanged()
}

func (s *LocalScheduler) armDueLocked(jobID string, due time.Time) {
	if _, exists := s.armed[jobID]; !exists && due.After(s.now()) {
		s.armed[jobID] = due
	}
}

func (s *LocalScheduler) dueCoordinator() {
	defer s.workers.Done()
	timer := time.NewTimer(time.Hour)
	defer timer.Stop()
	for {
		s.resetDueTimer(timer)
		select {
		case <-s.ctx.Done():
			return
		case <-s.scheduleChanged:
		case <-timer.C:
			s.dispatchDue()
		}
	}
}

func (s *LocalScheduler) resetDueTimer(timer *time.Timer) {
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	delay := time.Hour
	if due, exists := s.nextDue(); exists {
		delay = due.Sub(s.now())
		if delay < 0 {
			delay = 0
		}
	}
	timer.Reset(delay)
}

func (s *LocalScheduler) nextDue() (time.Time, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var next time.Time
	for _, due := range s.armed {
		if next.IsZero() || due.Before(next) {
			next = due
		}
	}
	return next, !next.IsZero()
}

func (s *LocalScheduler) dispatchDue() {
	now := s.now()
	for _, job := range s.dueOccurrences(now) {
		s.enqueueDue(job, now)
	}
}

func (s *LocalScheduler) dueOccurrences(now time.Time) []LocalScheduledJob {
	s.mu.Lock()
	defer s.mu.Unlock()
	jobs := make([]LocalScheduledJob, 0)
	for jobID, due := range s.armed {
		if !due.After(now) {
			jobs = append(jobs, LocalScheduledJob{ID: jobID, Status: "active", NextRunAt: due})
		}
	}
	return jobs
}

func (s *LocalScheduler) handleDue(jobID string, due time.Time) {
	s.enqueueDue(LocalScheduledJob{ID: jobID, Status: "active", NextRunAt: due}, s.now())
}

func (s *LocalScheduler) enqueueDue(job LocalScheduledJob, now time.Time) {
	s.mu.Lock()
	due, exists := s.armed[job.ID]
	if !exists || !due.Equal(job.NextRunAt) || s.closed {
		s.mu.Unlock()
		return
	}
	delete(s.armed, job.ID)
	if s.running[job.ID] || now.Sub(due) > localSchedulerDueCutoff {
		s.mu.Unlock()
		s.requestReconcile()
		return
	}
	s.claiming[job.ID] = job
	select {
	case s.dueJobs <- job:
		s.mu.Unlock()
	default:
		delete(s.claiming, job.ID)
		s.mu.Unlock()
		s.requestReconcile()
	}
}

func (s *LocalScheduler) signalScheduleChanged() {
	select {
	case s.scheduleChanged <- struct{}{}:
	default:
	}
}

func (s *LocalScheduler) requestReconcile() {
	select {
	case s.reconcileRequests <- struct{}{}:
	default:
	}
}

func (s *LocalScheduler) reconcileRequestsLoop() {
	defer s.workers.Done()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-s.reconcileRequests:
			_ = s.Refresh() // Reconciliation is best-effort; the periodic timer retries it.
		}
	}
}

func (s *LocalScheduler) reconcileLoop() {
	defer s.workers.Done()
	select {
	case <-s.ctx.Done():
		return
	case <-s.reconcileStarted:
	}
	ticker := time.NewTicker(s.reconcileInterval)
	defer ticker.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			_ = s.Refresh() // Reconciliation is best-effort; the next interval retries it.
		}
	}
}

func (s *LocalScheduler) isClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed
}

// Close cancels all callback contexts and waits for scheduler work to stop. It is idempotent.
func (s *LocalScheduler) Close() {
	s.closeOnce.Do(s.beginClose)
	s.workers.Wait()
	s.api.Lock()
	s.api.Unlock()
}

func (s *LocalScheduler) beginClose() {
	s.mu.Lock()
	s.closed = true
	clear(s.armed)
	s.mu.Unlock()
	s.cancel()
}
