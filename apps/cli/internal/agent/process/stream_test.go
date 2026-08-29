package process

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestReadStdout_WaitsAfterScannerReachesEOF(t *testing.T) {
	stdout, writer := io.Pipe()
	defer writer.Close()
	trackedStdout := &eofTrackingReadCloser{
		ReadCloser: stdout,
		reachedEOF: make(chan struct{}),
	}

	lineScanned := make(chan struct{})
	allowScannerToContinue := make(chan struct{})
	waitCalled := make(chan struct{})
	waitBeforeEOF := make(chan struct{})
	session := &Session{
		id:      "drain-order",
		done:    make(chan struct{}),
		manager: NewManager(),
		waitForExit: func() error {
			select {
			case <-trackedStdout.reachedEOF:
			default:
				close(waitBeforeEOF)
			}
			close(waitCalled)
			return nil
		},
	}
	go readStdout(session, trackedStdout, func(sessionID, tabID, workspaceID string, event []byte) {
		close(lineScanned)
		<-allowScannerToContinue
	})

	if _, err := fmt.Fprintln(writer, `{"type":"final"}`); err != nil {
		t.Fatalf("write stdout event: %v", err)
	}
	waitForProcessSignal(t, lineScanned, "stdout event scan")
	close(allowScannerToContinue)
	if err := writer.Close(); err != nil {
		t.Fatalf("close stdout writer: %v", err)
	}
	waitForProcessSignal(t, waitCalled, "process wait after stdout EOF")
	select {
	case <-waitBeforeEOF:
		t.Fatal("process wait began before stdout reached EOF")
	default:
	}
	waitForProcessSignal(t, session.done, "stdout cleanup")
}

type eofTrackingReadCloser struct {
	io.ReadCloser
	reachedEOF chan struct{}
	once       sync.Once
}

func (reader *eofTrackingReadCloser) Read(buffer []byte) (int, error) {
	count, err := reader.ReadCloser.Read(buffer)
	if err == io.EOF {
		reader.once.Do(func() { close(reader.reachedEOF) })
	}
	return count, err
}

func TestSessionSend_DrainsStdoutBeforeClosingProcessPipes(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen for helper notification: %v", err)
	}
	defer listener.Close()

	responseWritten := make(chan struct{})
	go acceptStdoutDrainNotification(listener, responseWritten)

	m := NewManager()
	callbackEntered := make(chan struct{})
	releaseCallback := make(chan struct{})
	finalEvent := make(chan struct{}, 1)
	opts := StartOptions{
		SessionID: "send-test",
		Binary:    filepath.Base(os.Args[0]),
		Args:      []string{"-test.run=^TestProcessStdoutDrainHelper$"},
		ExtraEnv: []string{
			"PATH=" + filepath.Dir(os.Args[0]) + string(os.PathListSeparator) + os.Getenv("PATH"),
			"GO_WANT_PROCESS_STDOUT_DRAIN_HELPER=1",
			"PROCESS_STDOUT_DRAIN_NOTIFY_ADDR=" + listener.Addr().String(),
		},
		OnEvent: func(sessionID, tabID, workspaceID string, event []byte) {
			switch string(event) {
			case "ready":
				close(callbackEntered)
				<-releaseCallback
			case "final":
				finalEvent <- struct{}{}
			}
		},
	}

	session, err := m.Start(context.Background(), opts)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer func() { _ = session.Close() }()

	waitForProcessSignal(t, callbackEntered, "stdout callback")
	closeDone := make(chan error, 1)
	go func() { closeDone <- session.Close() }()

	// The helper writes final only after Close closes stdin. The callback keeps
	// Scanner from reading final. Thus final is pending in the pipe before it is
	// allowed to scan again; a concurrent Cmd.Wait would close that pipe and
	// lose final deterministically.
	waitForProcessSignal(t, responseWritten, "helper final response")
	close(releaseCallback)

	waitForProcessSignal(t, finalEvent, "final stdout event")
	if err := <-closeDone; err != nil {
		t.Fatalf("Close failed: %v", err)
	}
}

func TestProcessStdoutDrainHelper(t *testing.T) {
	if os.Getenv("GO_WANT_PROCESS_STDOUT_DRAIN_HELPER") != "1" {
		return
	}

	fmt.Fprintln(os.Stdout, "ready")
	input := bufio.NewScanner(os.Stdin)
	for input.Scan() {
	}
	fmt.Fprintln(os.Stdout, "final")

	connection, err := net.Dial("tcp", os.Getenv("PROCESS_STDOUT_DRAIN_NOTIFY_ADDR"))
	if err != nil {
		os.Exit(2)
	}
	defer connection.Close()
	fmt.Fprintln(connection, "final")
	os.Exit(0)
}

func acceptStdoutDrainNotification(listener net.Listener, notified chan<- struct{}) {
	connection, err := listener.Accept()
	if err != nil {
		return
	}
	defer connection.Close()
	_, _ = bufio.NewReader(connection).ReadString('\n')
	close(notified)
}
