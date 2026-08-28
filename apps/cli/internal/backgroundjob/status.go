package backgroundjob

// Transition validates a lifecycle change. Terminal statuses cannot change.
func (status Status) Transition(next Status) (Status, error) {
	if !isValidStatus(status) || !isValidStatus(next) {
		return status, ErrInvalidTransition
	}
	if status == next {
		return status, nil
	}
	if status == StatusQueued && (next == StatusRunning || next == StatusCancelled || next == StatusInterrupted) {
		return next, nil
	}
	if status == StatusRunning && isTerminalStatus(next) {
		return next, nil
	}
	return status, ErrInvalidTransition
}

func isValidStatus(status Status) bool {
	return status == StatusQueued || status == StatusRunning || isTerminalStatus(status)
}

func isTerminalStatus(status Status) bool {
	return status == StatusSucceeded || status == StatusFailed || status == StatusCancelled || status == StatusInterrupted
}
