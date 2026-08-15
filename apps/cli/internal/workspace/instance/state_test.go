package instance

import "testing"

func TestStateTransition_Valid(t *testing.T) {
	cases := []struct {
		from State
		to   State
	}{
		{StateActive, StateActive},
		{StateActive, StateClosing},
		{StateActive, StateError},
		{StateError, StateError},
		{StateError, StateActive},
		{StateError, StateClosing},
		{StateClosing, StateClosing},
		{StateClosing, StateActive},
		{StateClosing, StateError},
	}
	for _, tc := range cases {
		got, err := tc.from.Transition(tc.to)
		if err != nil {
			t.Errorf("%q → %q: unexpected error: %v", tc.from, tc.to, err)
		}
		if got != tc.to {
			t.Errorf("%q → %q = %q, want %q", tc.from, tc.to, got, tc.to)
		}
	}
}

func TestStateTransition_Invalid(t *testing.T) {
	cases := []struct {
		from State
		to   State
	}{
		{"", StateActive},        // unknown source
		{"", StateClosing},       // unknown source
		{StateActive, ""},        // empty target
		{StateError, ""},         // empty target
		{"bogus", StateActive},   // unknown source
		{StateActive, "bogus"},   // unknown target
		{StateActive, "closed"},  // closed is a record status, not a runtime state
		{StateClosing, "closed"}, // closed is a record status, not a runtime state
	}
	for _, tc := range cases {
		if got, err := tc.from.Transition(tc.to); err == nil {
			t.Errorf("%q → %q: expected error, got %q", tc.from, tc.to, got)
		}
	}
}
