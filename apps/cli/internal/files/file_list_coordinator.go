package files

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
)

// Generation is intentionally absent: invalidation cannot replace active work.
// Recursive listing has no other result-affecting options today.
type recursiveScanKey struct{ root, path string }

type recursiveIdentity struct{ root, link, target os.FileInfo }

type recursiveScan struct {
	ctx        context.Context
	cancel     context.CancelFunc
	done       chan struct{}
	identity   recursiveIdentity
	generation uint64
	waiters    int
	followup   *recursiveScan
	entries    []FileEntry
	err        error
}

func canonicalListingRoot(root string) string {
	absolute, err := filepath.Abs(root)
	if err != nil {
		return filepath.Clean(root)
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return absolute
	}
	return resolved
}

func identifyRecursiveScan(root, path string) (recursiveScanKey, recursiveIdentity, error) {
	key := recursiveScanKey{root: canonicalListingRoot(root), path: filepath.Clean(path)}
	if key.path == "." {
		key.path = ""
	}
	if _, err := safeJoinOptional(key.root, key.path, false); err != nil {
		return key, recursiveIdentity{}, err
	}
	identity, err := readRecursiveIdentity(key.root)
	return key, identity, err
}

func readRecursiveIdentity(root string) (recursiveIdentity, error) {
	rootInfo, err := os.Stat(root)
	if err != nil {
		return recursiveIdentity{}, err
	}
	link := filepath.Join(root, ContextLinkName)
	linkInfo, err := os.Lstat(link)
	if err != nil && !os.IsNotExist(err) {
		return recursiveIdentity{}, err
	}
	targetInfo, err := os.Stat(link)
	if err != nil && !os.IsNotExist(err) {
		return recursiveIdentity{}, err
	}
	return recursiveIdentity{root: rootInfo, link: linkInfo, target: targetInfo}, nil
}

func sameListingFile(first, second os.FileInfo) bool {
	if first == nil || second == nil {
		return first == nil && second == nil
	}
	return os.SameFile(first, second)
}

func (identity recursiveIdentity) matches(other recursiveIdentity) bool {
	return sameListingFile(identity.root, other.root) && sameListingFile(identity.link, other.link) && sameListingFile(identity.target, other.target)
}

// ListWithProgress lists recursively, reporting completed dirty snapshots only
// as interim progress. Callbacks run on the waiter, outside service locks; they
// must return promptly. Only the final successful return is fresh. Nothing is
// persisted in a recursive result cache. Each waiter has a bounded total lifetime.
func (s *FileService) ListWithProgress(ctx context.Context, root, path string, interim func([]FileEntry)) ([]FileEntry, error) {
	ctx, cancel := context.WithTimeout(ctx, recursiveListTimeout)
	defer cancel()
	var previous *recursiveScan
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		key, identity, err := identifyRecursiveScan(root, path)
		if err != nil {
			return nil, err
		}
		scan := s.joinRecursiveScan(key, identity, previous)
		publish := guardListingProgress(root, path, key, identity, interim)
		entries, shouldRetry, err := s.waitRecursiveScan(ctx, key, scan, publish)
		if err != nil {
			return nil, err
		}
		currentKey, currentIdentity, err := identifyRecursiveScan(root, path)
		if err != nil {
			return nil, err
		}
		if currentKey != key || !identity.matches(currentIdentity) {
			return nil, changedListingLifecycle()
		}
		if !shouldRetry {
			return entries, nil
		}
		previous = scan
	}
}

func changedListingLifecycle() error {
	return NewError(ErrCodePathRestricted, "workspace root or context link changed during recursive listing; retry")
}

// A followup is retained only by live callers of its predecessor, never by a
// persistent cache. Even delayed waiters share its completed covering snapshot.
func (s *FileService) joinRecursiveScan(key recursiveScanKey, identity recursiveIdentity, previous *recursiveScan) *recursiveScan {
	s.mu.Lock()
	scan := s.recursiveScans[key]
	if previous != nil && previous.followup != nil {
		scan = previous.followup
	}
	shouldStart := scan == nil
	if shouldStart {
		ctx, cancel := context.WithTimeout(context.Background(), recursiveListTimeout)
		scan = &recursiveScan{ctx: ctx, cancel: cancel, done: make(chan struct{}), identity: identity, generation: s.cacheGenerationByRoot[key.root]}
		s.recursiveScans[key] = scan
	}
	if previous != nil {
		previous.followup = scan
	}
	scan.waiters++
	s.mu.Unlock()
	if shouldStart {
		go s.executeRecursiveScan(key, scan)
	}
	return scan
}

func guardListingProgress(root, path string, key recursiveScanKey, identity recursiveIdentity, interim func([]FileEntry)) func([]FileEntry) {
	if interim == nil {
		return nil
	}
	return func(entries []FileEntry) {
		currentKey, currentIdentity, err := identifyRecursiveScan(root, path)
		if err == nil && currentKey == key && identity.matches(currentIdentity) {
			interim(entries)
		}
	}
}

func (s *FileService) executeRecursiveScan(key recursiveScanKey, scan *recursiveScan) {
	entries, err := s.listRecursiveFiles(scan.ctx, key.root, key.path, filepath.Join(key.root, key.path))
	s.mu.Lock()
	scan.entries, scan.err = entries, err
	// Removal happens only after the executor returns, never on cancellation.
	delete(s.recursiveScans, key)
	close(scan.done)
	s.mu.Unlock()
	scan.cancel()
}

func (s *FileService) leaveRecursiveScan(scan *recursiveScan) {
	s.mu.Lock()
	scan.waiters--
	isLast := scan.waiters == 0
	s.mu.Unlock()
	if isLast {
		scan.cancel()
	}
}

func (s *FileService) waitRecursiveScan(ctx context.Context, key recursiveScanKey, scan *recursiveScan, interim func([]FileEntry)) ([]FileEntry, bool, error) {
	entries, isDirty, err := s.waitRecursiveSnapshot(ctx, key, scan)
	if ctx.Err() != nil {
		return nil, false, ctx.Err()
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return nil, true, nil
	}
	if isDirty && err == nil {
		if interim != nil {
			interim(entries)
		}
		return nil, true, nil
	}
	return entries, false, err
}

func (s *FileService) waitRecursiveSnapshot(ctx context.Context, key recursiveScanKey, scan *recursiveScan) ([]FileEntry, bool, error) {
	defer s.leaveRecursiveScan(scan)
	select {
	case <-ctx.Done():
		return nil, false, ctx.Err()
	case <-scan.done:
	}
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	identity, err := readRecursiveIdentity(key.root)
	if err != nil {
		return nil, false, err
	}
	if !scan.identity.matches(identity) {
		return nil, false, changedListingLifecycle()
	}
	if scan.err != nil {
		// A new waiter may have joined an already canceled executor. Retry only
		// after its actual termination; the waiter's total deadline still applies.
		if errors.Is(scan.err, context.Canceled) || errors.Is(scan.err, context.DeadlineExceeded) {
			return nil, true, scan.err
		}
		return nil, false, scan.err
	}
	s.mu.Lock()
	isDirty := s.cacheGenerationByRoot[key.root] != scan.generation
	s.mu.Unlock()
	entries := slices.Clone(scan.entries)
	return entries, isDirty, nil
}
