package plugins

import (
	"crypto/sha256"
	"encoding/hex"
)

func (m AdaptationManifest) isValid() bool {
	if m.Version == "" || len(m.Content) == 0 || len(m.SHA256) != 64 {
		return false
	}
	for _, character := range m.SHA256 {
		if !(character >= '0' && character <= '9') && !(character >= 'a' && character <= 'f') {
			return false
		}
	}
	return hashAdaptationManifest(m.Content) == m.SHA256
}

func hashAdaptationManifest(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}
