package backgroundjob

import (
	"errors"
	"testing"
)

func TestStatusTransition_Valid(t *testing.T) {
	tests := []struct{ from, to Status }{
		{StatusQueued, StatusQueued}, {StatusQueued, StatusRunning}, {StatusQueued, StatusCancelled},
		{StatusQueued, StatusInterrupted}, {StatusRunning, StatusRunning}, {StatusRunning, StatusSucceeded},
		{StatusRunning, StatusFailed}, {StatusRunning, StatusCancelled}, {StatusRunning, StatusInterrupted},
		{StatusSucceeded, StatusSucceeded}, {StatusFailed, StatusFailed}, {StatusCancelled, StatusCancelled},
		{StatusInterrupted, StatusInterrupted},
	}
	for _, test := range tests {
		if got, err := test.from.Transition(test.to); err != nil || got != test.to {
			t.Errorf("%q -> %q = %q, %v", test.from, test.to, got, err)
		}
	}
}

func TestStatusTransition_RejectsInvalid(t *testing.T) {
	tests := []struct{ from, to Status }{
		{"", StatusQueued}, {StatusQueued, ""}, {StatusQueued, StatusSucceeded},
		{StatusRunning, StatusQueued}, {StatusSucceeded, StatusFailed}, {"other", StatusRunning},
	}
	for _, test := range tests {
		if _, err := test.from.Transition(test.to); !errors.Is(err, ErrInvalidTransition) {
			t.Errorf("%q -> %q error = %v", test.from, test.to, err)
		}
	}
}
