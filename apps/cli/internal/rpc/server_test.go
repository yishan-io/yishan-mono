package rpc

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func TestServer_CloseLogging(t *testing.T) {
	for _, tc := range []struct {
		name      string
		code      int
		wantError bool
	}{
		{"normal", websocket.CloseNormalClosure, false},
		{"going away", websocket.CloseGoingAway, false},
		{"protocol error", websocket.CloseProtocolError, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			previous := log.Logger
			log.Logger = zerolog.New(&output)
			defer func() { log.Logger = previous }()
			runServerClose(t, tc.code)
			if got := strings.Contains(output.String(), "websocket read failed"); got != tc.wantError {
				t.Fatalf("read error logged = %v, want %v; logs: %s", got, tc.wantError, output.String())
			}
		})
	}
}

func runServerClose(t *testing.T, code int) {
	t.Helper()
	done := make(chan struct{})
	server := NewServer(nil)
	httpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(done)
		server.ServeHTTP(w, r)
	}))
	defer httpServer.Close()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(httpServer.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err := conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(code, ""), time.Now().Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("server did not finish after close frame")
	}
}
