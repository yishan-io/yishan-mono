//go:build !darwin

package fswatch

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/fsnotify/fsnotify"
)

type fsnotifyBackend struct {
	config      Config
	fw          *fsnotify.Watcher
	watchedDirs map[string]bool
}

func newBackend(config Config) (backend, error) {
	fw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("create fsnotify watcher: %w", err)
	}

	backend := &fsnotifyBackend{
		config:      config,
		fw:          fw,
		watchedDirs: make(map[string]bool),
	}

	if err := backend.start(); err != nil {
		fw.Close()
		return nil, err
	}

	go backend.consume()
	return backend, nil
}

func (b *fsnotifyBackend) start() error {
	for _, path := range dedupePaths(b.config.RecursivePaths) {
		if err := b.addRecursivePath(path); err != nil {
			return fmt.Errorf("watch recursive path %q: %w", path, err)
		}
	}
	for _, path := range dedupePaths(b.config.NonRecursivePaths) {
		if err := b.fw.Add(path); err != nil {
			emitError(b.config, fmt.Errorf("watch path %q: %w", path, err))
		}
	}
	return nil
}

func (b *fsnotifyBackend) consume() {
	for {
		select {
		case event, ok := <-b.fw.Events:
			if !ok {
				return
			}
			b.handleEvent(event)
		case err, ok := <-b.fw.Errors:
			if !ok {
				return
			}
			emitError(b.config, err)
		}
	}
}

func (b *fsnotifyBackend) handleEvent(event fsnotify.Event) {
	if event.Has(fsnotify.Create) {
		b.handleCreate(event.Name)
	}
	if event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
		b.removeRecursiveWatchesForPath(event.Name)
	}
	emitPathChanged(b.config, event.Name)
}

func (b *fsnotifyBackend) handleCreate(path string) {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() || !shouldWatchDir(b.config, path) {
		return
	}
	if err := b.addRecursivePath(path); err != nil {
		emitError(b.config, fmt.Errorf("watch new directory %q: %w", path, err))
	}
}

func (b *fsnotifyBackend) addRecursivePath(root string) error {
	if !shouldWatchDir(b.config, root) {
		return nil
	}
	if err := b.addSingleRecursiveWatch(root); err != nil {
		return err
	}

	candidateDirs, err := b.collectCandidateDirs(root)
	if err != nil {
		return err
	}
	for _, path := range candidateDirs {
		if !shouldWatchDir(b.config, path) {
			continue
		}
		if err := b.addSingleRecursiveWatch(path); err != nil {
			emitError(b.config, fmt.Errorf("watch directory %q: %w", path, err))
		}
	}
	return nil
}

func (b *fsnotifyBackend) collectCandidateDirs(root string) ([]string, error) {
	candidateDirs := make([]string, 0)
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil || !entry.IsDir() {
			return nil
		}
		if path != root && !shouldDescendDir(b.config, path) {
			return filepath.SkipDir
		}
		if path != root {
			candidateDirs = append(candidateDirs, path)
		}
		return nil
	})
	return candidateDirs, err
}

func (b *fsnotifyBackend) addSingleRecursiveWatch(path string) error {
	if b.watchedDirs[path] {
		return nil
	}
	b.watchedDirs[path] = true
	if err := b.fw.Add(path); err != nil {
		delete(b.watchedDirs, path)
		return err
	}
	return nil
}

func (b *fsnotifyBackend) removeRecursiveWatchesForPath(path string) {
	prefix := path + string(filepath.Separator)
	for watchedPath := range b.watchedDirs {
		if watchedPath == path || strings.HasPrefix(watchedPath, prefix) {
			_ = b.fw.Remove(watchedPath)
			delete(b.watchedDirs, watchedPath)
		}
	}
}

func (b *fsnotifyBackend) close() {
	_ = b.fw.Close()
}
