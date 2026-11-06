package files

import (
	"context"
	"errors"
)

// ListSnapshot is a completed listing with explicit generation freshness.
// A stale snapshot is usable interim data, never a promise of a quiet tree.
type ListSnapshot struct {
	Files   []FileEntry `json:"files"`
	IsFresh bool        `json:"isFresh"`
}

// ListSnapshot joins one executor without waiting for a quiet generation.
// Shallow listings retain their cache semantics and track concurrent invalidation.
func (s *FileService) ListSnapshot(ctx context.Context, root, path string, recursive bool) (ListSnapshot, error) {
	ctx, cancel := context.WithTimeout(ctx, recursiveListTimeout)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return ListSnapshot{}, err
	}
	key, identity, err := identifyRecursiveScan(root, path)
	if err != nil {
		return ListSnapshot{}, err
	}
	var entries []FileEntry
	isDirty := false
	if recursive {
		entries, isDirty, err = s.recursiveSnapshot(ctx, key, identity)
	} else {
		entries, isDirty, err = s.shallowSnapshot(ctx, root, path, key)
	}
	if err != nil {
		return ListSnapshot{}, err
	}
	if err := validateSnapshotLifecycle(ctx, root, path, key, identity); err != nil {
		return ListSnapshot{}, err
	}
	if entries == nil {
		entries = []FileEntry{}
	}
	return ListSnapshot{Files: entries, IsFresh: !isDirty}, nil
}

func validateSnapshotLifecycle(ctx context.Context, root, path string, key recursiveScanKey, identity recursiveIdentity) error {
	currentKey, currentIdentity, err := identifyRecursiveScan(root, path)
	if err != nil {
		return err
	}
	if currentKey != key || !identity.matches(currentIdentity) {
		return changedListingLifecycle()
	}
	return ctx.Err()
}

// Retry only failed workers, after actual termination, under the original deadline.
// A successful dirty snapshot is returned immediately rather than retried.
func (s *FileService) recursiveSnapshot(ctx context.Context, key recursiveScanKey, identity recursiveIdentity) ([]FileEntry, bool, error) {
	var previous *recursiveScan
	for {
		if err := ctx.Err(); err != nil {
			return nil, false, err
		}
		scan := s.joinRecursiveScan(key, identity, previous)
		entries, dirty, err := s.waitRecursiveSnapshot(ctx, key, scan)
		if ctx.Err() != nil {
			return nil, false, ctx.Err()
		}
		if !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			return entries, dirty, err
		}
		previous = scan
	}
}

func (s *FileService) shallowSnapshot(ctx context.Context, root, path string, key recursiveScanKey) ([]FileEntry, bool, error) {
	s.mu.Lock()
	generation := s.cacheGenerationByRoot[key.root]
	s.mu.Unlock()
	entries, err := s.List(ctx, root, path, false)
	s.mu.Lock()
	dirty := generation != s.cacheGenerationByRoot[key.root]
	s.mu.Unlock()
	return entries, dirty, err
}
