package scanner

import (
	"os"
	"time"
)

func scanWindowStart(input ScanInput) (time.Time, bool) {
	if input.ScanSinceUnixMilli <= 0 {
		return time.Time{}, false
	}
	return time.UnixMilli(input.ScanSinceUnixMilli).UTC(), true
}

func isBeforeScanWindow(timestamp time.Time, input ScanInput) bool {
	windowStart, hasWindow := scanWindowStart(input)
	if !hasWindow {
		return false
	}
	return timestamp.UTC().Before(windowStart)
}

func shouldScanFileWithModTime(path string, input ScanInput) bool {
	windowStart, hasWindow := scanWindowStart(input)
	if !hasWindow {
		return true
	}
	fileInfo, err := os.Stat(path)
	if err != nil {
		return true
	}
	return !fileInfo.ModTime().UTC().Before(windowStart)
}
