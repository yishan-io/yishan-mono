package auth

import (
	"os"
	"path/filepath"
	"strings"
)

// Ambient credential sources resolved by pi for cloud providers that never
// write to auth.json (AWS env credential chain, GCP Application Default
// Credentials). The store reports these as `type: "ambient"` entries so the
// settings view can surface providers that are usable without a stored
// credential. Detection mirrors pi-ai's provider resolve functions exactly —
// it never invents sources pi would not resolve (e.g. ~/.aws files are NOT
// read by pi-ai's amazon-bedrock resolve).

const vertexDefaultADCFile = "application_default_credentials.json"

// detectAmbientProviderAuth mirrors pi's provider credential resolution for
// providers that support cloud/ambient auth. Returns the detected source
// label, or an empty string when no ambient credential is available.
func detectAmbientProviderAuth(provider string) string {
	switch provider {
	case "amazon-bedrock":
		return detectAmbientBedrock()
	case "google-vertex":
		return detectAmbientVertex()
	default:
		return ""
	}
}

// detectAmbientBedrock mirrors pi-ai amazon-bedrock.js resolve order exactly:
// bearer token env, AWS_PROFILE env, access keys, ECS task roles, and IRSA
// web identity tokens. ~/.aws config files are intentionally NOT scanned —
// pi-ai does not resolve them without an env source.
func detectAmbientBedrock() string {
	if envNonEmpty("AWS_BEARER_TOKEN_BEDROCK") {
		return "AWS_BEARER_TOKEN_BEDROCK"
	}
	if profile := strings.TrimSpace(os.Getenv("AWS_PROFILE")); profile != "" {
		return "AWS_PROFILE: " + profile
	}
	if envNonEmpty("AWS_ACCESS_KEY_ID") && envNonEmpty("AWS_SECRET_ACCESS_KEY") {
		return "AWS access keys"
	}
	if envNonEmpty("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI") || envNonEmpty("AWS_CONTAINER_CREDENTIALS_FULL_URI") {
		return "ECS task role"
	}
	if envNonEmpty("AWS_WEB_IDENTITY_TOKEN_FILE") {
		return "web identity token"
	}
	return ""
}

// detectAmbientVertex mirrors pi-ai google-vertex.js resolve: an ADC file
// (explicit GOOGLE_APPLICATION_CREDENTIALS or the default gcloud path) plus
// project and location env vars (GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT and
// GOOGLE_CLOUD_LOCATION). Note two deliberate leniencies vs pi-ai: env vars
// set to empty fall back to defaults here (pi-ai does not), and the
// GOOGLE_CLOUD_API_KEY path is not reported as ambient (it is a stored/env
// api_key credential, not a cloud credential).
func detectAmbientVertex() string {
	adcPath := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS")
	if adcPath == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return ""
		}
		adcPath = filepath.Join(home, ".config", "gcloud", vertexDefaultADCFile)
	}
	if info, err := os.Stat(adcPath); err != nil || !info.Mode().IsRegular() {
		return ""
	}
	if !envNonEmpty("GOOGLE_CLOUD_PROJECT") && !envNonEmpty("GCLOUD_PROJECT") {
		return ""
	}
	if !envNonEmpty("GOOGLE_CLOUD_LOCATION") {
		return ""
	}
	return "gcloud application default credentials"
}

func envNonEmpty(name string) bool {
	return strings.TrimSpace(os.Getenv(name)) != ""
}
