package daemon

import (
	"context"
	"errors"
	"net"
	"net/http"
	"os"
	"sync"
	"syscall"
	"testing"
	"time"
)

type delayedBackgroundJobCleanup struct {
	mu                sync.Mutex
	closeCalls        int
	cleanupReleased   <-chan struct{}
	cleanupStarted    chan struct{}
	terminalPersisted chan struct{}
}

func (c *delayedBackgroundJobCleanup) Close() error {
	c.mu.Lock()
	c.closeCalls++
	closeCalls := c.closeCalls
	c.mu.Unlock()
	if closeCalls == 1 {
		return context.DeadlineExceeded
	}
	if c.cleanupStarted != nil {
		close(c.cleanupStarted)
	}
	<-c.cleanupReleased
	close(c.terminalPersisted)
	return nil
}

func TestCloseAppForShutdown_RetriesUntilDelayedBackgroundCleanupPersistsTerminalState(t *testing.T) {
	cleanupReleased := make(chan struct{})
	cleanup := &delayedBackgroundJobCleanup{
		cleanupReleased:   cleanupReleased,
		terminalPersisted: make(chan struct{}),
	}
	serverShutdown := make(chan struct{})
	shutdownDone := make(chan error, 1)
	go func() {
		shutdownDone <- closeAppForShutdown(context.Background(), cleanup)
		close(serverShutdown)
	}()

	select {
	case <-serverShutdown:
		t.Fatal("daemon shutdown completed before delayed background cleanup persisted its terminal state")
	case <-time.After(2 * appCloseRetryDelay):
	}

	close(cleanupReleased)
	select {
	case <-cleanup.terminalPersisted:
	case <-time.After(time.Second):
		t.Fatal("delayed background cleanup did not persist its terminal state")
	}
	select {
	case <-serverShutdown:
	case <-time.After(time.Second):
		t.Fatal("daemon shutdown did not continue after background cleanup completed")
	}
	if err := <-shutdownDone; err != nil {
		t.Fatalf("close app for shutdown: %v", err)
	}
	cleanup.mu.Lock()
	defer cleanup.mu.Unlock()
	if cleanup.closeCalls != 2 {
		t.Fatalf("app close calls = %d, want 2", cleanup.closeCalls)
	}
}

func TestShutdownContext_WaitsForSignalCleanupAndServerShutdown(t *testing.T) {
	cleanupReleased := make(chan struct{})
	cleanup := &delayedBackgroundJobCleanup{
		cleanupReleased:   cleanupReleased,
		cleanupStarted:    make(chan struct{}),
		terminalPersisted: make(chan struct{}),
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{}
	serverErr := make(chan error, 1)
	serverStopped := make(chan struct{})
	go func() {
		serverErr <- server.Serve(listener)
		close(serverStopped)
	}()

	_, cancelShutdown := context.WithCancel(context.Background())
	processCtx, cancelProcess := context.WithCancel(context.Background())
	defer cancelProcess()
	stop := make(chan os.Signal, 1)
	shutdownStarted := make(chan struct{})
	shutdownComplete := make(chan struct{})
	go handleShutdownSignal(stop, cancelShutdown, processCtx, cancelProcess, cleanup, server, serverStopped, shutdownStarted, shutdownComplete)

	sc := &shutdownContext{
		shutdownStarted:  shutdownStarted,
		shutdownComplete: shutdownComplete,
		serverErr:        serverErr,
	}
	waitDone := make(chan error, 1)
	go func() { waitDone <- sc.waitForShutdown() }()
	stop <- syscall.SIGTERM
	<-cleanup.cleanupStarted

	select {
	case err := <-waitDone:
		t.Fatalf("Run returned before durable cleanup and server shutdown: %v", err)
	case <-time.After(2 * appCloseRetryDelay):
	}
	connection, err := net.DialTimeout("tcp", listener.Addr().String(), time.Second)
	if err != nil {
		t.Fatalf("server stopped before durable cleanup: %v", err)
	}
	_ = connection.Close()

	close(cleanupReleased)
	select {
	case <-cleanup.terminalPersisted:
	case <-time.After(time.Second):
		t.Fatal("delayed background cleanup did not persist its terminal state")
	}
	select {
	case err := <-waitDone:
		if err != nil {
			t.Fatalf("wait for shutdown: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run did not return after cleanup and server shutdown")
	}
}

func TestCloseAfterRegistrationFailure_WaitsForRunningBackgroundJobCleanup(t *testing.T) {
	cleanupReleased := make(chan struct{})
	cleanup := &delayedBackgroundJobCleanup{
		cleanupReleased:   cleanupReleased,
		cleanupStarted:    make(chan struct{}),
		terminalPersisted: make(chan struct{}),
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{}
	serverStopped := make(chan struct{})
	go func() {
		_ = server.Serve(listener)
		close(serverStopped)
	}()
	processCtx, cancelProcess := context.WithCancel(context.Background())
	defer cancelProcess()
	registrationErr := errors.New("node registration failed")
	shutdownDone := make(chan error, 1)
	go func() {
		shutdownDone <- closeAfterRegistrationFailure(&shutdownContext{
			processCtx:    processCtx,
			cancelRelay:   func() {},
			serverStopped: serverStopped,
		}, cleanup, server, registrationErr)
	}()
	<-cleanup.cleanupStarted
	select {
	case err := <-shutdownDone:
		t.Fatalf("registration failure returned before running job cleanup: %v", err)
	case <-time.After(2 * appCloseRetryDelay):
	}
	close(cleanupReleased)
	select {
	case <-cleanup.terminalPersisted:
	case <-time.After(time.Second):
		t.Fatal("running job cleanup did not persist terminal state")
	}
	if err := <-shutdownDone; !errors.Is(err, registrationErr) {
		t.Fatalf("registration failure = %v", err)
	}
}

func TestShutdownContext_UnexpectedServeExitWaitsForDurableAppCleanup(t *testing.T) {
	cleanupReleased := make(chan struct{})
	cleanup := &delayedBackgroundJobCleanup{
		cleanupReleased:   cleanupReleased,
		cleanupStarted:    make(chan struct{}),
		terminalPersisted: make(chan struct{}),
	}
	processCtx, cancelProcess := context.WithCancel(context.Background())
	defer cancelProcess()
	stop := make(chan os.Signal, 1)
	shutdownStarted := make(chan struct{})
	shutdownComplete := make(chan struct{})
	serverStopped := make(chan struct{})
	close(serverStopped)
	serverErr := make(chan error, 1)
	serveErr := errors.New("listener failed")
	serverErr <- serveErr
	go handleShutdownSignal(stop, func() {}, processCtx, cancelProcess, cleanup, &http.Server{}, serverStopped, shutdownStarted, shutdownComplete)

	sc := &shutdownContext{
		processCtx:       processCtx,
		cancelProcess:    cancelProcess,
		cancelRelay:      func() {},
		stop:             stop,
		shutdownStarted:  shutdownStarted,
		shutdownComplete: shutdownComplete,
		serverStopped:    serverStopped,
		serverErr:        serverErr,
	}
	waitDone := make(chan error, 1)
	go func() { waitDone <- sc.waitForShutdown() }()
	select {
	case <-cleanup.cleanupStarted:
	case <-time.After(time.Second):
		t.Fatal("unexpected server exit did not start App.Close cleanup")
	}
	select {
	case err := <-waitDone:
		t.Fatalf("Run returned before durable cleanup: %v", err)
	case <-time.After(2 * appCloseRetryDelay):
	}
	close(cleanupReleased)
	select {
	case <-cleanup.terminalPersisted:
	case <-time.After(time.Second):
		t.Fatal("App.Close did not persist terminal state after server exit")
	}
	if err := <-waitDone; !errors.Is(err, serveErr) {
		t.Fatalf("server error = %v, want %v", err, serveErr)
	}
}
