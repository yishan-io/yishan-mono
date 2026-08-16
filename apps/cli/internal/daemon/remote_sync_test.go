package daemon

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"yishan/apps/cli/internal/adapter/cloud"
)

func TestIsReauthRequiredError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "nil",
			err:  nil,
			want: false,
		},
		{
			name: "token refresh error",
			err: &cloud.TokenRefreshError{
				RequestError: errors.New("request failed"),
				RefreshError: errors.New("invalid refresh token"),
			},
			want: true,
		},
		{
			name: "direct unauthorized api error",
			err:  &cloud.APIError{StatusCode: http.StatusUnauthorized},
			want: true,
		},
		{
			name: "wrapped unauthorized api error",
			err:  fmt.Errorf("outer: %w", &cloud.APIError{StatusCode: http.StatusUnauthorized}),
			want: true,
		},
		{
			name: "non-unauthorized api error",
			err:  &cloud.APIError{StatusCode: http.StatusForbidden},
			want: false,
		},
		{
			name: "plain error",
			err:  errors.New("boom"),
			want: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := isReauthRequiredError(tc.err)
			if got != tc.want {
				t.Fatalf("expected %v, got %v", tc.want, got)
			}
		})
	}
}

func TestFormatReauthRequiredMessage(t *testing.T) {
	message := formatReauthRequiredMessage("remote workspace creation")
	if message == "" {
		t.Fatal("expected non-empty message")
	}
	if want := "Run `yishan login` and retry"; !strings.Contains(message, want) {
		t.Fatalf("expected message %q to contain %q", message, want)
	}
}
