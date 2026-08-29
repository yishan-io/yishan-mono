// Package dsh owns the lifecycle of one DSH SDK JSON-RPC runtime process.
package dsh

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"
)

const (
	defaultRestartLimit    = 3
	defaultRestartBackoff  = time.Second
	defaultStartupTimeout  = 10 * time.Second
	defaultShutdownTimeout = 5 * time.Second
)

// CommandFactory builds an unstarted DSH runtime command.
type CommandFactory func(context.Context) (*exec.Cmd, error)

// InitializeConfig selects the process-wide SDK defaults. Session-specific
// workspace binding is added by the Yishan protocol extension.
type InitializeConfig struct {
	CWD       string
	Provider  string
	Model     string
	MaxTokens int
}

// Config controls one DSH process. Command is injected because production DSH
// binary composition is deliberately outside this foundation phase.
type Config struct {
	Command         CommandFactory
	Initialize      InitializeConfig
	RestartLimit    int
	RestartBackoff  time.Duration
	RestartWait     func(context.Context, time.Duration)
	StartupTimeout  time.Duration
	ShutdownTimeout time.Duration
	Diagnostics     func(string)
}

// Health is a snapshot of the runtime lifecycle state.
type Health struct {
	IsReady       bool
	RestartCount  int
	ServerVersion string
	InstanceID    string
	LastError     string
}

// Supervisor starts, validates, restarts, and stops a single DSH runtime.
type Supervisor struct {
	config Config
	ctx    context.Context
	cancel context.CancelFunc

	mu                 sync.RWMutex
	process            *runtimeProcess
	startingProcess    *runtimeProcess
	startDone          chan struct{}
	isStarting         bool
	isClosing          bool
	isRestartScheduled bool
	restartProcess     *runtimeProcess
	restartDone        chan error
	health             Health
	readyListeners     []func()
	nextID             uint64
	runtimeInstanceID  uint64
}

type runtimeProcess struct {
	command       *exec.Cmd
	stdin         io.WriteCloser
	output        *bufio.Scanner
	done          chan struct{}
	exitErr       error
	writeMu       sync.Mutex
	pendingMu     sync.Mutex
	pending       map[uint64]chan rpcResponse
	terminalErr   error
	replay        *replayCoordinator
	isInvalidated bool
}

// NewSupervisor constructs a stopped supervisor with safe lifecycle defaults.
func NewSupervisor(config Config) *Supervisor {
	config = normalizeConfig(config)
	ctx, cancel := context.WithCancel(context.Background())
	return &Supervisor{config: config, ctx: ctx, cancel: cancel, nextID: 1}
}

func normalizeConfig(config Config) Config {
	if config.RestartLimit == 0 {
		config.RestartLimit = defaultRestartLimit
	}
	if config.RestartBackoff <= 0 {
		config.RestartBackoff = defaultRestartBackoff
	}
	if config.RestartWait == nil {
		config.RestartWait = waitForRestart
	}
	if config.StartupTimeout <= 0 {
		config.StartupTimeout = defaultStartupTimeout
	}
	if config.ShutdownTimeout <= 0 {
		config.ShutdownTimeout = defaultShutdownTimeout
	}
	return config
}

// Start launches the runtime and completes its initialize handshake.
func (s *Supervisor) Start(ctx context.Context) error {
	if err := validateInitialize(s.config.Initialize); err != nil {
		return err
	}
	if err := s.reserveStart(); err != nil {
		return err
	}
	defer s.releaseStart()
	return s.startProcess(ctx)
}

func (s *Supervisor) reserveStart() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.config.Command == nil {
		return errors.New("DSH command factory is required")
	}
	if s.isClosing {
		return errors.New("DSH supervisor is closed")
	}
	if s.isStarting || s.isRestartScheduled || s.process != nil {
		return errors.New("DSH runtime is already started")
	}
	s.isStarting = true
	s.startDone = make(chan struct{})
	return nil
}

func (s *Supervisor) releaseStart() {
	s.mu.Lock()
	s.isStarting = false
	if s.startDone != nil {
		close(s.startDone)
		s.startDone = nil
	}
	s.mu.Unlock()
}

func validateInitialize(initialize InitializeConfig) error {
	if initialize.CWD == "" || initialize.Provider == "" || initialize.Model == "" {
		return errors.New("DSH initialize requires cwd, provider, and model")
	}
	if initialize.MaxTokens < 0 {
		return errors.New("DSH initialize max tokens must not be negative")
	}
	return nil
}

func (s *Supervisor) startProcess(ctx context.Context) error {
	return s.startProcessWithRetry(ctx, true)
}

func (s *Supervisor) startProcessWithRetry(ctx context.Context, shouldRetry bool) error {
	process, err := s.createProcess(s.ctx)
	if err != nil {
		return s.failStart(err, shouldRetry)
	}
	if err := s.publishStarting(process); err != nil {
		return s.failProcess(process, err, shouldRetry)
	}
	handshakeCtx, cancel := s.handshakeContext(ctx)
	defer cancel()
	serverVersion, err := s.initialize(handshakeCtx, process)
	if err != nil {
		return s.failProcess(process, err, shouldRetry)
	}
	return s.markReady(process, serverVersion)
}

func (s *Supervisor) publishStarting(process *runtimeProcess) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isClosing {
		return context.Canceled
	}
	s.startingProcess = process
	return nil
}

func (s *Supervisor) handshakeContext(caller context.Context) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithTimeout(s.ctx, s.config.StartupTimeout)
	stop := context.AfterFunc(caller, cancel)
	return ctx, func() { stop(); cancel() }
}

func (s *Supervisor) failStart(err error, shouldRetry bool) error {
	s.recordFailure(err)
	if shouldRetry {
		s.scheduleRestart()
	}
	return err
}

func (s *Supervisor) failProcess(process *runtimeProcess, err error, shouldRetry bool) error {
	s.clearStartingProcess(process)
	s.stopFailedProcess(process)
	s.recordFailure(err)
	if shouldRetry {
		s.scheduleRestart()
	}
	return err
}

func (s *Supervisor) clearStartingProcess(process *runtimeProcess) {
	s.mu.Lock()
	if s.startingProcess == process {
		s.startingProcess = nil
	}
	s.mu.Unlock()
}

func (s *Supervisor) createProcess(ctx context.Context) (*runtimeProcess, error) {
	command, err := s.config.Command(ctx)
	if err != nil {
		return nil, fmt.Errorf("build DSH command: %w", err)
	}
	stdin, stdout, stderr, err := openPipes(command)
	if err != nil {
		return nil, err
	}
	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("start DSH runtime: %w", err)
	}
	process := &runtimeProcess{
		command: command, stdin: stdin, output: newScanner(stdout),
		done: make(chan struct{}), pending: make(map[uint64]chan rpcResponse), replay: newReplayCoordinator(defaultReplayCapacity),
	}
	go s.scanDiagnostics(stderr)
	go s.waitForProcess(command, process)
	return process, nil
}

func openPipes(command *exec.Cmd) (io.WriteCloser, io.ReadCloser, io.ReadCloser, error) {
	stdin, err := command.StdinPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("open DSH stdin: %w", err)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("open DSH stdout: %w", err)
	}
	stderr, err := command.StderrPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("open DSH stderr: %w", err)
	}
	return stdin, stdout, stderr, nil
}

func newScanner(reader io.Reader) *bufio.Scanner {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	return scanner
}

func (s *Supervisor) initialize(ctx context.Context, process *runtimeProcess) (string, error) {
	if err := sendInitialize(process.stdin, s.config.Initialize); err != nil {
		return "", err
	}
	return readInitializeResponse(ctx, process.output)
}

func (s *Supervisor) markReady(process *runtimeProcess, serverVersion string) error {
	s.mu.Lock()
	if s.isClosing {
		s.mu.Unlock()
		s.stopFailedProcess(process)
		return context.Canceled
	}
	s.startingProcess = nil
	s.process = process
	s.runtimeInstanceID++
	s.health.IsReady = true
	s.health.ServerVersion = serverVersion
	s.health.InstanceID = fmt.Sprintf("dsh-%d", s.runtimeInstanceID)
	s.health.LastError = ""
	readyListeners := append([]func(){}, s.readyListeners...)
	s.mu.Unlock()
	for _, listener := range readyListeners {
		go listener()
	}
	go s.drainOutput(process)
	go s.awaitExit(process)
	return nil
}

func (s *Supervisor) scanDiagnostics(stderr io.Reader) {
	scanner := newScanner(stderr)
	for scanner.Scan() {
		s.diagnose("DSH stderr: " + scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		s.diagnose(fmt.Sprintf("read DSH stderr: %v", err))
	}
}

func (s *Supervisor) waitForProcess(command *exec.Cmd, process *runtimeProcess) {
	process.exitErr = command.Wait()
	close(process.done)
}

func (s *Supervisor) awaitExit(process *runtimeProcess) {
	<-process.done
	err := exitError(process.exitErr)
	process.replay.invalidate()
	process.failPending(err)
	isClosing, shouldRestart, restartDone := s.clearExitedProcess(process, err)
	if restartDone != nil {
		restartDone <- s.startReplacement()
		close(restartDone)
		return
	}
	if isClosing || !shouldRestart {
		return
	}
	s.diagnose(err.Error())
	s.scheduleRestart()
}

func (s *Supervisor) clearExitedProcess(process *runtimeProcess, err error) (bool, bool, chan error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	shouldRestart := process.isInvalidated
	var restartDone chan error
	if s.restartProcess == process {
		s.restartProcess = nil
		restartDone = s.restartDone
		s.restartDone = nil
	}
	if s.process == process {
		s.process = nil
		s.health.IsReady = false
		s.health.InstanceID = ""
		s.health.LastError = err.Error()
		shouldRestart = true
	}
	return s.isClosing, shouldRestart && restartDone == nil, restartDone
}

func exitError(err error) error {
	if err == nil {
		return errors.New("DSH runtime exited unexpectedly")
	}
	return fmt.Errorf("DSH runtime exited: %w", err)
}

func (s *Supervisor) stopFailedProcess(process *runtimeProcess) {
	_ = process.stdin.Close() // closing stdin requests graceful runtime shutdown
	if process.command.Process != nil {
		_ = process.command.Process.Kill()
	}
	<-process.done
}

// OnReady registers a callback for each successful DSH initialization.
func (s *Supervisor) OnReady(listener func()) {
	if listener == nil {
		return
	}
	s.mu.Lock()
	s.readyListeners = append(s.readyListeners, listener)
	isReady := s.health.IsReady
	s.mu.Unlock()
	if isReady {
		go listener()
	}
}

// Health returns a consistent snapshot suitable for daemon health reporting.
func (s *Supervisor) Health() Health { s.mu.RLock(); defer s.mu.RUnlock(); return s.health }

// Close stops restart activity and terminates the runtime before its deadline.
func (s *Supervisor) Close() error {
	s.mu.Lock()
	if s.isClosing {
		s.mu.Unlock()
		return nil
	}
	s.isClosing = true
	process := s.process
	isStartingProcess := process == nil
	if isStartingProcess {
		process = s.startingProcess
	}
	startDone := s.startDone
	s.mu.Unlock()
	s.cancel()
	if process != nil {
		process.replay.invalidate()
		process.interruptPending(ErrRuntimeUnavailable)
	}
	var err error
	if isStartingProcess && process != nil {
		s.stopFailedProcess(process)
	} else if process != nil {
		err = s.stopProcess(process)
	}
	if startDone != nil {
		<-startDone
	}
	return err
}

func (s *Supervisor) stopProcess(process *runtimeProcess) error {
	deadline := time.NewTimer(s.config.ShutdownTimeout)
	defer deadline.Stop()
	response, remove := s.sendShutdown(process)
	defer remove()
	select {
	case frame := <-response:
		_ = process.stdin.Close() // graceful shutdown has completed
		return s.waitForShutdown(process, deadline.C, shutdownError(frame))
	case <-process.done:
		return nil
	case <-deadline.C:
		return s.killProcess(process, nil)
	}
}

func (s *Supervisor) sendShutdown(process *runtimeProcess) (<-chan rpcResponse, func()) {
	s.mu.Lock()
	s.nextID++
	id := s.nextID
	s.mu.Unlock()
	response, remove := process.registerPending(id)
	if err := writeRequest(process, id, "shutdown", nil); err != nil {
		remove()
		failed := make(chan rpcResponse, 1)
		failed <- rpcResponse{err: err}
		return failed, func() {}
	}
	return response, remove
}

func shutdownError(frame rpcResponse) error {
	if frame.err != nil {
		return frame.err
	}
	if frame.rpcError != nil {
		return &RequestError{Method: "shutdown", Code: frame.rpcError.Code, Message: frame.rpcError.Message, Data: frame.rpcError.Data}
	}
	return nil
}

func (s *Supervisor) waitForShutdown(process *runtimeProcess, deadline <-chan time.Time, responseErr error) error {
	select {
	case <-process.done:
		return responseErr
	case <-deadline:
		return s.killProcess(process, responseErr)
	}
}

func (s *Supervisor) killProcess(process *runtimeProcess, prior error) error {
	if err := process.command.Process.Kill(); err != nil && prior == nil {
		prior = fmt.Errorf("kill DSH runtime: %w", err)
	}
	<-process.done
	return prior
}

func (s *Supervisor) recordFailure(err error) {
	s.mu.Lock()
	s.health.IsReady = false
	s.health.InstanceID = ""
	s.health.LastError = err.Error()
	s.mu.Unlock()
	s.diagnose(err.Error())
}

func (s *Supervisor) diagnose(message string) {
	if s.config.Diagnostics != nil {
		s.config.Diagnostics(message)
	}
}
