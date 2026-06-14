package logx

import (
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

const (
	FormatPretty = "pretty"
	FormatJSON   = "json"
)

type Config struct {
	Level  string
	Format string
	Out    io.Writer
	// FileOut is an optional additional writer for file-based logging.
	// When set, logs are written to both Out (with format) and FileOut (always JSON).
	// Typically this is a *FileWriter with rotation.
	FileOut io.Writer
	// Version is the CLI build version. When non-empty it is attached to every
	// log entry as the "version" field.
	Version string
}

func Configure(cfg Config) error {
	level := strings.TrimSpace(strings.ToLower(cfg.Level))
	if level == "" {
		level = "info"
	}

	parsedLevel, err := zerolog.ParseLevel(level)
	if err != nil {
		return fmt.Errorf("invalid log level %q: %w", cfg.Level, err)
	}

	format := strings.TrimSpace(strings.ToLower(cfg.Format))
	if format == "" {
		format = FormatPretty
	}
	if format != FormatPretty && format != FormatJSON {
		return fmt.Errorf("invalid log format %q: expected %q or %q", cfg.Format, FormatPretty, FormatJSON)
	}

	out := cfg.Out
	if out == nil {
		out = os.Stderr
	}

	zerolog.SetGlobalLevel(parsedLevel)
	zerolog.TimeFieldFormat = time.RFC3339

	// Determine the effective writer.
	// If FileOut is configured, we use a multi-writer: the console/stderr output
	// uses the configured format, while the file always gets JSON for machine parsing.
	// When running detached (background daemon), stderr is redirected to the log
	// file by the parent process. Skip the console writer in that case to avoid
	// duplicate entries: once as console-formatted output and once as JSON via FileOut.
	var writer io.Writer
	if cfg.FileOut != nil && os.Getenv("YISHAN_DAEMON_DETACHED") != "1" {
		var consoleOut io.Writer
		if format == FormatJSON {
			consoleOut = out
		} else {
			consoleOut = zerolog.ConsoleWriter{Out: out, TimeFormat: time.RFC3339}
		}
		writer = zerolog.MultiLevelWriter(consoleOut, cfg.FileOut)
	} else if cfg.FileOut != nil {
		writer = cfg.FileOut
	} else {
		if format == FormatJSON {
			writer = out
		} else {
			writer = zerolog.ConsoleWriter{Out: out, TimeFormat: time.RFC3339}
		}
	}

	ctx := zerolog.New(writer).With().Timestamp()
	if cfg.Version != "" {
		ctx = ctx.Str("version", cfg.Version)
	}
	log.Logger = ctx.Logger()
	return nil
}
