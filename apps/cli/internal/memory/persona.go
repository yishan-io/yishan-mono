package memory

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// personaFilePath returns the canonical path to the user's global PERSONA.md file.
func personaFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}
	return filepath.Join(home, ".yishan", "memory", "PERSONA.md"), nil
}

// PersonaFilePath is the exported version of personaFilePath, for use by CLI commands.
func PersonaFilePath() (string, error) {
	return personaFilePath()
}

// cliAgentDBReader wraps the package agentDBReader for use by CLI commands;
// NewAgentDBReaderForCLI is the only way to construct it.
type cliAgentDBReader struct {
	r *agentDBReader
}

// NewAgentDBReaderForCLI creates a cliAgentDBReader for use in CLI commands.
func NewAgentDBReaderForCLI() *cliAgentDBReader {
	return &cliAgentDBReader{r: newAgentDBReader()}
}

func (a *cliAgentDBReader) ReadSessionsForDate(agent string, date time.Time) ([]*sessionMessages, error) {
	return a.r.ReadSessionsForDate(agent, date)
}

// BuildEmptyPersonaMarkdown returns an empty PERSONA.md with all five section headings.
// Used by `yishan persona clear` and `yishan setup` to initialise the persona file.
func BuildEmptyPersonaMarkdown() string {
	return buildPersonaMarkdown(personaSections{})
}

// sessionDateReader reads the session transcripts for one calendar date; the
// concrete agentDBReader implements it, and tests substitute a stub.
type sessionDateReader interface {
	ReadSessionsForDate(agent string, date time.Time) ([]*sessionMessages, error)
}

// personaService manages the daily persona batch extraction state. The
// LLM-backed extraction itself lives in personaSummarizer (persona_summarizer.go).
type personaService struct {
	summarizer         *personaSummarizer
	dbReader           sessionDateReader
	mu                 sync.Mutex
	lastExtractionDate string // "YYYY-MM-DD" UTC, empty = never run
}

func newPersonaService(cfg SummarizerConfig, runAgent RunAgentFunc) *personaService {
	return &personaService{
		summarizer: NewPersonaSummarizer(cfg, runAgent),
		dbReader:   newAgentDBReader(),
	}
}

// maybeRunBatch starts the daily batch goroutine when the calendar day has
// advanced past lastExtractionDate. Guards against concurrent runs with a mutex.
func (p *personaService) maybeRunBatch(agent string) {
	today := time.Now().UTC().Format("2006-01-02")

	p.mu.Lock()
	if today == p.lastExtractionDate {
		p.mu.Unlock()
		return
	}
	p.lastExtractionDate = today
	p.mu.Unlock()

	// Skip the goroutine entirely if the summarizer isn't configured, but still
	// advance the date so we don't re-trigger on every subsequent session stop.
	if !p.summarizer.Enabled() {
		return
	}

	// Extract for yesterday's sessions.
	yesterday := time.Now().UTC().AddDate(0, 0, -1)
	go p.runBatch(agent, yesterday)
}

// runBatch performs the actual extraction for the given date. Runs in a goroutine.
func (p *personaService) runBatch(agent string, date time.Time) {
	sessions, err := p.dbReader.ReadSessionsForDate(agent, date)
	if err != nil {
		log.Debug().Err(err).Str("agent", agent).Msg("persona batch: read sessions failed")
		return
	}
	if len(sessions) == 0 {
		log.Debug().Str("agent", agent).Str("date", date.Format("2006-01-02")).Msg("persona batch: no sessions found")
		return
	}

	result, err := p.summarizer.SummarizeForPersona(agent, sessions)
	if err != nil {
		if errors.Is(err, ErrAgentNotFound) {
			log.Debug().Err(err).Str("agent", agent).Msg("persona batch: agent binary not found, skipping")
		} else {
			log.Warn().Err(err).Str("agent", agent).Msg("persona batch: extraction failed")
		}
		return
	}
	if result.Skipped {
		log.Debug().Str("agent", agent).Msg("persona batch: skipped")
		return
	}
	log.Info().Str("agent", agent).Str("path", result.WrittenPath).Msg("persona batch: written")
}
