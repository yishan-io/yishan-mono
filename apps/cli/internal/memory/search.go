package memory

const defaultSearchLimit = 20

// MemorySearchResult is one search hit returned by SearchMemory.
type MemorySearchResult struct {
	Path    string  `json:"path"`
	Snippet string  `json:"snippet"`
	Score   float64 `json:"score"`
}

type SearchInput struct {
	Query     string
	ProjectID string
	Scope     string
	Limit     int
}

func (db *DB) SearchMemory(input SearchInput) ([]MemorySearchResult, error) {
	limit := input.Limit
	if limit <= 0 || limit > 100 {
		limit = defaultSearchLimit
	}

	var fileType fileType
	if input.Scope == "global" {
		fileType = FileTypeGlobal
	}

	return db.Search(input.Query, input.ProjectID, fileType, limit)
}
