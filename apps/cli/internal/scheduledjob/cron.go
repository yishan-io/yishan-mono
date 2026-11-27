// Package scheduledjob holds the scheduled-job domain: cron schedules, job
// and run records, and their validation. It mirrors the rules api-service
// used before scheduled jobs moved into the daemon.
package scheduledjob

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	// Embedded zone data keeps IANA time zones working on hosts without a
	// system zoneinfo database (notably Windows).
	_ "time/tzdata"
)

// maxCronScanMinutes bounds the next-run search to ~400 days.
const maxCronScanMinutes = 60 * 24 * 400

var weekdayNames = map[string]int{"SUN": 0, "MON": 1, "TUE": 2, "WED": 3, "THU": 4, "FRI": 5, "SAT": 6}

var cronFieldBounds = [5]struct {
	label    string
	min, max int
}{{"minute", 0, 59}, {"hour", 0, 23}, {"dayOfMonth", 1, 31}, {"month", 1, 12}, {"dayOfWeek", 0, 6}}

type cronField struct {
	any    bool
	values map[int]bool
}

func (field cronField) matches(value int) bool {
	return field.any || field.values[value]
}

// Cron is a parsed five-field expression (minute hour day month weekday).
// Like api-service, day-of-month and day-of-week must both match.
type Cron struct {
	Source     string
	minute     cronField
	hour       cronField
	dayOfMonth cronField
	month      cronField
	dayOfWeek  cronField
}

// ParseCron parses a five-field cron expression. Weekday names SUN-SAT,
// ranges, lists and steps are supported.
func ParseCron(expression string) (Cron, error) {
	parts := strings.Fields(expression)
	if len(parts) != 5 {
		return Cron{}, fmt.Errorf("cron expression must have exactly 5 fields (minute hour day month weekday)")
	}
	fields := make([]cronField, 5)
	for index, part := range parts {
		bound := cronFieldBounds[index]
		field, err := parseCronField(part, bound.label, bound.min, bound.max)
		if err != nil {
			return Cron{}, err
		}
		fields[index] = field
	}
	return Cron{Source: strings.Join(parts, " "), minute: fields[0], hour: fields[1], dayOfMonth: fields[2], month: fields[3], dayOfWeek: fields[4]}, nil
}

func parseCronField(input string, label string, minValue int, maxValue int) (cronField, error) {
	if input == "*" {
		return cronField{any: true}, nil
	}
	values := make(map[int]bool)
	for _, token := range strings.Split(input, ",") {
		if strings.TrimSpace(token) == "" {
			return cronField{}, fmt.Errorf("%s: empty value in list", label)
		}
		expanded, err := expandCronToken(strings.TrimSpace(token), minValue, maxValue, label)
		if err != nil {
			return cronField{}, err
		}
		for _, value := range expanded {
			values[value] = true
		}
	}
	if len(values) == 0 {
		return cronField{}, fmt.Errorf("%s: resolves to no values", label)
	}
	return cronField{values: values}, nil
}

func expandCronToken(token string, minValue int, maxValue int, label string) ([]int, error) {
	base, stepText, hasStep := strings.Cut(token, "/")
	if base == "" {
		return nil, fmt.Errorf("%s: empty token", label)
	}
	values, err := expandCronBase(base, minValue, maxValue, label)
	if err != nil || !hasStep {
		return values, err
	}
	step, err := cronNumber(stepText, 1, maxValue, label+" step")
	if err != nil {
		return nil, err
	}
	stepped := make([]int, 0, len(values))
	for _, value := range values {
		if (value-values[0])%step == 0 {
			stepped = append(stepped, value)
		}
	}
	return stepped, nil
}

func expandCronBase(base string, minValue int, maxValue int, label string) ([]int, error) {
	if base == "*" {
		return cronRange(minValue, maxValue), nil
	}
	startText, endText, isRange := strings.Cut(base, "-")
	if !isRange {
		value, err := cronNumber(base, minValue, maxValue, label)
		return []int{value}, err
	}
	if startText == "" || endText == "" {
		return nil, fmt.Errorf("%s: bad range %q", label, base)
	}
	start, err := cronNumber(startText, minValue, maxValue, label)
	if err != nil {
		return nil, err
	}
	end, err := cronNumber(endText, minValue, maxValue, label)
	if err != nil {
		return nil, err
	}
	if end < start {
		return nil, fmt.Errorf("%s: range end < start", label)
	}
	return cronRange(start, end), nil
}

func cronNumber(value string, minValue int, maxValue int, label string) (int, error) {
	if named, ok := weekdayNames[strings.ToUpper(value)]; ok {
		return named, nil
	}
	number, err := strconv.Atoi(value)
	if err != nil || strings.HasPrefix(value, "-") || strings.HasPrefix(value, "+") {
		return 0, fmt.Errorf("%s: %q is not a number", label, value)
	}
	if number < minValue || number > maxValue {
		return 0, fmt.Errorf("%s: %d is out of range %d-%d", label, number, minValue, maxValue)
	}
	return number, nil
}

func cronRange(from int, to int) []int {
	values := make([]int, 0, to-from+1)
	for value := from; value <= to; value++ {
		values = append(values, value)
	}
	return values
}

// LoadTimezone validates an IANA time zone name.
func LoadTimezone(timezone string) (*time.Location, error) {
	trimmed := strings.TrimSpace(timezone)
	if trimmed == "" {
		return nil, fmt.Errorf("timezone must not be empty")
	}
	location, err := time.LoadLocation(trimmed)
	if err != nil {
		return nil, fmt.Errorf("unsupported timezone: %s", trimmed)
	}
	return location, nil
}

// NextRun returns the first minute strictly after from that matches the
// schedule in location.
func (cron Cron) NextRun(location *time.Location, from time.Time) (time.Time, error) {
	cursor := from.UTC().Truncate(time.Minute).Add(time.Minute)
	for range maxCronScanMinutes {
		if cron.matches(cursor.In(location)) {
			return cursor, nil
		}
		cursor = cursor.Add(time.Minute)
	}
	return time.Time{}, fmt.Errorf("unable to compute next run: no match within 400 days")
}

func (cron Cron) matches(local time.Time) bool {
	return local.Second() == 0 && cron.minute.matches(local.Minute()) && cron.hour.matches(local.Hour()) &&
		cron.dayOfMonth.matches(local.Day()) && cron.month.matches(int(local.Month())) &&
		cron.dayOfWeek.matches(int(local.Weekday()))
}

// NextRunAt parses expression and timezone and computes the next run after from.
func NextRunAt(expression string, timezone string, from time.Time) (time.Time, error) {
	cron, err := ParseCron(expression)
	if err != nil {
		return time.Time{}, err
	}
	location, err := LoadTimezone(timezone)
	if err != nil {
		return time.Time{}, err
	}
	return cron.NextRun(location, from)
}
