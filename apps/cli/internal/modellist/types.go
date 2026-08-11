package modellist

import "time"

const DefaultCacheTTL = 5 * time.Minute

type ModelInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Reasoning reports whether the model supports thinking at all. Derived
	// from the pi --list-models "thinking" column, and overridden by the
	// models-store.json catalog entry when present.
	Reasoning bool `json:"reasoning"`
	// ThinkingLevelMap maps pi thinking levels to provider-specific values; a
	// null value marks the level as unsupported. Merged from models-store.json
	// when the managed agent dir has it.
	ThinkingLevelMap map[string]*string `json:"thinkingLevelMap,omitempty"`
}

type AgentModelList struct {
	AgentKind   string      `json:"agentKind"`
	Models      []ModelInfo `json:"models"`
	Source      string      `json:"source"`
	FetchedAt   int64       `json:"fetchedAt"`
	CacheExpiry int64       `json:"cacheExpiry"`
}

type Fetcher interface {
	AgentKind() string
	Fetch() ([]ModelInfo, error)
}

type FetchSource string

const (
	SourceCLI    FetchSource = "cli"
	SourceStatic FetchSource = "static"
	SourceCache  FetchSource = "cache"
	SourceError  FetchSource = "error"
)

type agentFetcher struct {
	cli    Fetcher
	static Fetcher
}

