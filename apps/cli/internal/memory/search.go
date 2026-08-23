package memory

const defaultSearchLimit = 20

const (
	// SourceMemory identifies existing .my-context and global Memory results.
	SourceMemory = "memory"
	// SourceTaskContext identifies Local Task Context document results.
	SourceTaskContext = "task_context"
)

// MemorySearchResult is one search hit returned by SearchMemory.
type MemorySearchResult struct {
	Path         string  `json:"path"`
	Snippet      string  `json:"snippet"`
	Score        float64 `json:"score"`
	Source       string  `json:"source,omitempty"`
	TaskID       string  `json:"taskId,omitempty"`
	TaskTitle    string  `json:"taskTitle,omitempty"`
	DocumentType string  `json:"documentType,omitempty"`
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
