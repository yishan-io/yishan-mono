package output

import "testing"

func TestCodeToExitCode(t *testing.T) {
	cases := []struct {
		code string
		want int
	}{
		{"unauthenticated", ExitUnauthenticated},
		{"not_found", ExitNotFound},
		{"permission_denied", ExitForbidden},
		{"daemon_not_running", ExitDaemonNotRun},
		{"server_error", ExitServerError},
		{"validation_error", ExitUsageError},
		{"conflict", ExitError},
		{"unknown_code", ExitError},
		{"", ExitError},
	}
	for _, tc := range cases {
		if got := CodeToExitCode(tc.code); got != tc.want {
			t.Errorf("CodeToExitCode(%q) = %d, want %d", tc.code, got, tc.want)
		}
	}
}
