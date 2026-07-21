package clidetector

import (
	"slices"
	"sync"
)

type Registry struct {
	mu        sync.RWMutex
	detectors []Detector
}

func NewRegistry(detectors ...Detector) *Registry {
	return &Registry{detectors: slices.Clone(detectors)}
}

func (r *Registry) SetDetectors(detectors ...Detector) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.detectors = slices.Clone(detectors)
}

func (r *Registry) List(forceRefresh bool) []Status {
	r.mu.RLock()
	detectors := slices.Clone(r.detectors)
	r.mu.RUnlock()

	results := make([][]Status, len(detectors))
	var waitGroup sync.WaitGroup
	waitGroup.Add(len(detectors))

	for index, detector := range detectors {
		go func(index int, detector Detector) {
			defer waitGroup.Done()
			results[index] = detector.Detect(forceRefresh)
		}(index, detector)
	}

	waitGroup.Wait()

	statuses := make([]Status, 0, len(detectors))
	for _, detectorStatuses := range results {
		statuses = append(statuses, detectorStatuses...)
	}

	slices.SortFunc(statuses, func(left Status, right Status) int {
		if left.Category == right.Category {
			if left.ToolID < right.ToolID {
				return -1
			}
			if left.ToolID > right.ToolID {
				return 1
			}
			return 0
		}
		if left.Category < right.Category {
			return -1
		}
		return 1
	})

	return statuses
}
