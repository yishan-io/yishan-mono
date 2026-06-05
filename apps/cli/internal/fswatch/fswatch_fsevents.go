//go:build darwin

package fswatch

import (
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsevents"
)

const fseventsLatency = 100 * time.Millisecond

type fseventsBackend struct {
	config            Config
	stream            *fsevents.EventStream
	recursivePaths    []string
	nonRecursivePaths []string
	done              chan struct{}
	closeOnce         sync.Once
}

func newBackend(config Config) (backend, error) {
	recursivePaths := dedupePaths(config.RecursivePaths)
	nonRecursivePaths := dedupePaths(config.NonRecursivePaths)
	paths := dedupePaths(append(append([]string{}, recursivePaths...), nonRecursivePaths...))
	stream := &fsevents.EventStream{
		Paths:   paths,
		Flags:   fsevents.FileEvents | fsevents.WatchRoot,
		Latency: fseventsLatency,
		Events:  make(chan []fsevents.Event, 256),
	}
	if err := stream.Start(); err != nil {
		return nil, fmt.Errorf("start fsevents stream: %w", err)
	}

	backend := &fseventsBackend{
		config:            config,
		stream:            stream,
		recursivePaths:    recursivePaths,
		nonRecursivePaths: nonRecursivePaths,
		done:              make(chan struct{}),
	}
	go backend.consume()
	return backend, nil
}

func (b *fseventsBackend) consume() {
	for {
		select {
		case <-b.done:
			return
		case batch, ok := <-b.stream.Events:
			if !ok {
				return
			}
			for _, event := range batch {
				path := normalizeFSEventPath(event.Path)
				if path == "" {
					continue
				}
				if !b.shouldEmitPath(path) {
					continue
				}
				emitPathChanged(b.config, path)
			}
		}
	}
}

func (b *fseventsBackend) shouldEmitPath(path string) bool {
	for _, root := range b.recursivePaths {
		if isPathWithinRoot(path, root) {
			return true
		}
	}
	for _, root := range b.nonRecursivePaths {
		if isPathAtNonRecursiveDepth(path, root) {
			return true
		}
	}
	return false
}

func isPathWithinRoot(path string, root string) bool {
	return path == root || strings.HasPrefix(path, root+string(filepath.Separator))
}

func isPathAtNonRecursiveDepth(path string, root string) bool {
	if path == root {
		return true
	}
	if filepath.Dir(path) != root {
		return false
	}
	return true
}

func normalizeFSEventPath(path string) string {
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return canonicalizePath(path)
	}
	return canonicalizePath(string(filepath.Separator) + strings.TrimPrefix(path, string(filepath.Separator)))
}

func (b *fseventsBackend) close() {
	b.closeOnce.Do(func() {
		close(b.done)
		b.stream.Stop()
	})
}
