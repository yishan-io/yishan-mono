package fswatch

import "fmt"

type Config struct {
	RecursivePaths    []string
	NonRecursivePaths []string
	ShouldWatchDir    func(path string) bool
	ShouldDescendDir  func(path string) bool
	OnPathChanged     func(path string)
	OnError           func(error)
}

type Watcher struct {
	backend backend
}

type backend interface {
	close()
}

func New(config Config) (*Watcher, error) {
	if config.OnPathChanged == nil {
		return nil, fmt.Errorf("fswatch on path changed callback is required")
	}
	backend, err := newBackend(config)
	if err != nil {
		return nil, err
	}
	return &Watcher{backend: backend}, nil
}

func (w *Watcher) Close() {
	if w == nil || w.backend == nil {
		return
	}
	w.backend.close()
}
