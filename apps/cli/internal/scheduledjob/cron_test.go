package scheduledjob

import (
	"testing"
	"time"
)

func TestParseCronAcceptsTheSupportedSyntax(t *testing.T) {
	for _, expression := range []string{"5 4 * * 1", "* * * * *", "*/15 * * * *", "0 0 1-5 * *", "1,15,30 * * * *", "0 9 * * MON-FRI", "1-30/5 * * * *"} {
		if _, err := ParseCron(expression); err != nil {
			t.Fatalf("%q: %v", expression, err)
		}
	}
	parsed, _ := ParseCron("  0  0  *  *  *  ")
	if parsed.Source != "0 0 * * *" {
		t.Fatalf("expected normalized source, got %q", parsed.Source)
	}
	if got, _ := ParseCron("*/15 * * * *"); len(got.minute.values) != 4 || !got.minute.values[45] {
		t.Fatalf("unexpected */15 expansion: %v", got.minute.values)
	}
}

func TestParseCronRejectsInvalidExpressions(t *testing.T) {
	for _, expression := range []string{"* * * *", "* * * * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 7", "5-1 * * * *", "a * * * *", "*/0 * * * *", ", * * * *", "-1 * * * *"} {
		if _, err := ParseCron(expression); err == nil {
			t.Fatalf("expected %q to be rejected", expression)
		}
	}
}

func TestNextRunAt(t *testing.T) {
	from := time.Date(2026, 11, 28, 10, 30, 45, 0, time.UTC)
	cases := []struct {
		expression, timezone string
		want                 time.Time
	}{
		{"* * * * *", "UTC", time.Date(2026, 11, 28, 10, 31, 0, 0, time.UTC)},
		{"0 9 * * *", "UTC", time.Date(2026, 11, 29, 9, 0, 0, 0, time.UTC)},
		// 09:00 in Auckland (UTC+13 in November) is 20:00 UTC the day before.
		{"0 9 * * *", "Pacific/Auckland", time.Date(2026, 11, 28, 20, 0, 0, 0, time.UTC)},
		// 2026-11-30 is a Monday.
		{"0 8 * * MON", "UTC", time.Date(2026, 11, 30, 8, 0, 0, 0, time.UTC)},
		{"0 0 1 1 *", "UTC", time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)},
	}
	for _, testCase := range cases {
		got, err := NextRunAt(testCase.expression, testCase.timezone, from)
		if err != nil || !got.Equal(testCase.want) {
			t.Fatalf("%s %s: got %v err=%v, want %v", testCase.expression, testCase.timezone, got, err, testCase.want)
		}
	}
	if _, err := NextRunAt("0 0 31 2 *", "UTC", from); err == nil {
		t.Fatal("expected an impossible date to fail")
	}
	if _, err := NextRunAt("* * * * *", "Mars/Olympus", from); err == nil {
		t.Fatal("expected an unknown timezone to fail")
	}
}
