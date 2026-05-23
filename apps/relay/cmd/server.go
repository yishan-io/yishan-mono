package cmd

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"yishan/apps/relay/internal/auth"
	"yishan/apps/relay/internal/jobqueue"
	"yishan/apps/relay/internal/relay"
)

// shutdownTimeout is the maximum time allowed for graceful HTTP server shutdown.
const shutdownTimeout = 10 * time.Second

// startServer wires the relay components and runs the HTTP server.
func startServer() error {
	cfg, err := configFromEnv()
	if err != nil {
		return err
	}

	level, err := zerolog.ParseLevel(cfg.LogLevel)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	if cfg.JWTSecret == "" {
		return fmt.Errorf("JWT_SECRET is required")
	}
	if cfg.APIToken == "" {
		return fmt.Errorf("RELAY_API_TOKEN is required")
	}

	authenticator := auth.NewAuthenticator(auth.Config{
		Secret:   cfg.JWTSecret,
		Issuer:   cfg.JWTIssuer,
		Audience: cfg.JWTAudience,
	})

	sessions := relay.NewSessionManager()

	queue := jobqueue.NewManager(sessions, jobqueue.Config{
		AckTimeout:    cfg.JobAckTimeout,
		ResultTimeout: cfg.JobResultTimeout,
		MaxRetries:    cfg.JobMaxRetries,
	})

	srv := relay.NewServer(sessions, authenticator, queue, cfg.APIToken)

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", srv.HandleWebSocket)
	mux.HandleFunc("/client/ws", srv.HandleClientWebSocket)
	mux.HandleFunc("/healthz", handleHealthz)
	mux.HandleFunc("/api/v1/dispatch", srv.HandleDispatch)
	mux.HandleFunc("/api/v1/org-events", srv.HandlePublishOrgEvent)
	mux.HandleFunc("/api/v1/runs/", srv.HandleRunStatus)
	mux.HandleFunc("/api/v1/metrics", srv.HandleMetrics)

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	httpServer := &http.Server{Addr: addr, Handler: mux}

	// Graceful shutdown on SIGINT / SIGTERM.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		log.Info().Msg("shutting down relay server")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		_ = httpServer.Shutdown(shutdownCtx)
	}()

	log.Info().Str("addr", addr).Msg("relay server starting")
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("listen: %w", err)
	}

	log.Info().Msg("relay server stopped")
	return nil
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
