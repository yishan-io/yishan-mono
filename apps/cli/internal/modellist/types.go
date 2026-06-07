package modellist

import "time"

const DefaultCacheTTL = 24 * time.Hour

type ModelInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
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

