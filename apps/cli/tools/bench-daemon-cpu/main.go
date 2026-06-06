package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type runtimeState struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

func main() {
	profile := "benchcpu"
	if value := os.Getenv("YISHAN_BENCH_PROFILE"); value != "" {
		profile = value
	}
	statePath := filepath.Join(os.Getenv("HOME"), ".yishan", "profiles", profile, "daemon.state.json")
	raw, err := os.ReadFile(statePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read state: %v\n", err)
		os.Exit(1)
	}
	var state runtimeState
	if err := json.Unmarshal(raw, &state); err != nil {
		fmt.Fprintf(os.Stderr, "parse state: %v\n", err)
		os.Exit(1)
	}

	endpoint := "ws://" + state.Host + ":" + strconv.Itoa(state.Port) + "/ws"

	workers := readEnvInt("YISHAN_BENCH_WORKERS", 8)
	callsPerWorker := readEnvInt("YISHAN_BENCH_CALLS_PER_WORKER", 2000)
	delayMicros := readEnvInt("YISHAN_BENCH_DELAY_MICROS", 0)
	callDelay := time.Duration(delayMicros) * time.Microsecond

	start := time.Now()
	var wg sync.WaitGroup
	errCh := make(chan error, workers*callsPerWorker)

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			conn, _, err := websocket.DefaultDialer.Dial(endpoint, http.Header{})
			if err != nil {
				errCh <- err
				return
			}
			defer conn.Close()

			for j := 0; j < callsPerWorker; j++ {
				req := map[string]any{"jsonrpc": "2.0", "id": j + 1, "method": "list", "params": map[string]any{}}
				err := conn.WriteJSON(req)
				if err == nil {
					_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
					_, _, err = conn.ReadMessage()
				}
				if err != nil {
					errCh <- err
					return
				}
				if callDelay > 0 {
					time.Sleep(callDelay)
				}
			}
		}()
	}

	wg.Wait()
	close(errCh)
	for err := range errCh {
		fmt.Fprintf(os.Stderr, "rpc error: %v\n", err)
		os.Exit(1)
	}

	duration := time.Since(start)
	totalCalls := workers * callsPerWorker
	fmt.Printf("total_calls=%d duration_ms=%d calls_per_sec=%.2f\n", totalCalls, duration.Milliseconds(), float64(totalCalls)/duration.Seconds())
}

func readEnvInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
