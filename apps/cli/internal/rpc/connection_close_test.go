package rpc

import "testing"

func TestConnection_CloseMarksConnectionClosedAndRunsLateHook(t *testing.T) {
	connection := NewConnection(nil)
	connection.Close()
	if connection.IsOpen() {
		t.Fatal("closed connection reports open")
	}
	called := false
	connection.AddCloseHook(func() { called = true })
	if !called {
		t.Fatal("late close hook did not run")
	}
}

func TestConnection_AddCloseHookRaceWithCloseRunsHookOnce(t *testing.T) {
	connection := NewConnection(nil)
	started := make(chan struct{})
	finished := make(chan struct{})
	calls := make(chan struct{}, 1)
	go func() {
		<-started
		connection.AddCloseHook(func() { calls <- struct{}{} })
		close(finished)
	}()
	close(started)
	connection.Close()
	<-finished
	select {
	case <-calls:
	default:
		t.Fatal("close hook did not run")
	}
	select {
	case <-calls:
		t.Fatal("close hook ran more than once")
	default:
	}
}
