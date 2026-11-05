package watchers

// admitNotification registers the entire sequence before callbacks run. Close
// seals under mu, so Wait cannot race a later positive WaitGroup.Add.
func (w *worktreeWatcher) admitNotification() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.isClosed || w.commandParent().Err() != nil {
		return false
	}
	w.notifications.Add(1)
	return true
}

func (w *worktreeWatcher) finishNotification() {
	w.notifications.Done()
}
