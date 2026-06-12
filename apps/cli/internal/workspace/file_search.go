package workspace

import (
	"sort"
	"strings"
)

const (
	filenameMatchBaseScore = 2_000
	pathMatchBaseScore     = 1_000
	contiguousBaseScore    = 700
	subsequenceBaseScore   = 500
	defaultFileSearchLimit = 100
)

type FileSearchResult struct {
	Path                   string `json:"path"`
	Score                  int    `json:"score"`
	HighlightedPathIndexes []int  `json:"highlightedPathIndexes"`
}

type subsequenceMatch struct {
	indexes []int
	score   int
}

func (s *FileService) Search(root string, rawQuery string, limit int) ([]FileSearchResult, error) {
	if limit <= 0 {
		limit = defaultFileSearchLimit
	}

	entries, err := s.List(root, "", true)
	if err != nil {
		return nil, err
	}

	query := strings.TrimSpace(strings.ToLower(rawQuery))
	results := make([]FileSearchResult, 0)
	for _, entry := range entries {
		if entry.IsDir {
			continue
		}
		if entry.IsIgnored && !isContextEntry(entry.Path) {
			continue
		}
		result, ok := resolveFilePathMatch(entry.Path, query)
		if !ok {
			continue
		}
		results = append(results, result)
	}

	sort.Slice(results, func(left, right int) bool {
		if results[left].Score != results[right].Score {
			return results[left].Score > results[right].Score
		}
		if len(results[left].Path) != len(results[right].Path) {
			return len(results[left].Path) < len(results[right].Path)
		}
		return results[left].Path < results[right].Path
	})

	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

func resolveFilePathMatch(path string, query string) (FileSearchResult, bool) {
	if query == "" {
		return FileSearchResult{Path: path, Score: -len(path)}, true
	}

	matchPath := strings.TrimRight(path, "/")
	normalizedPath := strings.ToLower(matchPath)
	filenameStart := strings.LastIndex(matchPath, "/") + 1
	normalizedFilename := normalizedPath[filenameStart:]

	if filenameMatch, ok := resolveSubsequenceMatch(normalizedFilename, query); ok {
		highlights := make([]int, 0, len(filenameMatch.indexes))
		for _, index := range filenameMatch.indexes {
			highlights = append(highlights, index+filenameStart)
		}
		return FileSearchResult{
			Path:                   path,
			Score:                  filenameMatchBaseScore + filenameMatch.score,
			HighlightedPathIndexes: highlights,
		}, true
	}

	pathQuery := compactPathQuery(query)
	pathMatch, ok := resolveSubsequenceMatch(normalizedPath, pathQuery)
	if !ok {
		return FileSearchResult{}, false
	}
	return FileSearchResult{
		Path:                   path,
		Score:                  pathMatchBaseScore + pathMatch.score,
		HighlightedPathIndexes: pathMatch.indexes,
	}, true
}

func compactPathQuery(query string) string {
	builder := strings.Builder{}
	builder.Grow(len(query))
	for _, character := range query {
		if character == '/' || character == '\\' || character == ' ' || character == '\t' || character == '\n' {
			continue
		}
		builder.WriteRune(character)
	}
	return builder.String()
}

func resolveSubsequenceMatch(target string, query string) (subsequenceMatch, bool) {
	contiguousMatch, hasContiguous := resolveContiguousMatch(target, query)

	indexes := make([]int, 0, len(query))
	nextIndex := 0
	for _, character := range query {
		foundIndex := strings.IndexRune(target[nextIndex:], character)
		if foundIndex < 0 {
			return contiguousMatch, hasContiguous
		}
		absoluteIndex := nextIndex + foundIndex
		indexes = append(indexes, absoluteIndex)
		nextIndex = absoluteIndex + 1
	}

	firstIndex := 0
	lastIndex := 0
	if len(indexes) > 0 {
		firstIndex = indexes[0]
		lastIndex = indexes[len(indexes)-1]
	}
	spread := lastIndex - firstIndex - len(query) + 1
	match := subsequenceMatch{
		indexes: indexes,
		score:   subsequenceBaseScore - spread*3 - firstIndex*2 - len(target),
	}
	if !hasContiguous || match.score > contiguousMatch.score {
		return match, true
	}
	return contiguousMatch, true
}

// isContextEntry reports whether path is inside the .my-context directory.
// These entries are git-ignored locally but should still appear in file search.
func isContextEntry(path string) bool {
	return strings.HasPrefix(path, ContextLinkName+"/")
}

func resolveContiguousMatch(target string, query string) (subsequenceMatch, bool) {
	start := strings.Index(target, query)
	if start < 0 {
		return subsequenceMatch{}, false
	}
	indexes := make([]int, 0, len(query))
	for index := 0; index < len(query); index++ {
		indexes = append(indexes, start+index)
	}
	return subsequenceMatch{
		indexes: indexes,
		score:   contiguousBaseScore - start*2 - len(target),
	}, true
}
