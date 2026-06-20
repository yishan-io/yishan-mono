package computer

import "strings"

var blockedBundleIDs = map[string]struct{}{
	"com.apple.keychainaccess": {},
	"com.1password.1password":  {},
}

func isBlockedBundleID(bundleID string) bool {
	_, blocked := blockedBundleIDs[strings.ToLower(strings.TrimSpace(bundleID))]
	return blocked
}
