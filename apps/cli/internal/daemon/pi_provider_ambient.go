package daemon

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Ambient credential sources resolved by pi for cloud providers that never
// write to auth.json (AWS profiles/roles, GCP Application Default Credentials).
// The daemon reports these as `type: "ambient"` entries so the settings view
// can surface providers that are usable without a stored credential.

const (
	vertexDefaultADCFile = "application_default_credentials.json"
)

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

// detectAmbientBedrock mirrors pi-ai amazon-bedrock.js resolution order:
// bearer token env, AWS_PROFILE (env or profiles in ~/.aws files), access
// keys, ECS task roles, and IRSA web identity tokens.
func detectAmbientBedrock() string {
	if envNonEmpty("AWS_BEARER_TOKEN_BEDROCK") {
		return "AWS_BEARER_TOKEN_BEDROCK"
	}
	if profile := strings.TrimSpace(os.Getenv("AWS_PROFILE")); profile != "" {
		return "AWS_PROFILE: " + profile
	}
	if names := awsProfileNames(); len(names) > 0 {
		return "AWS profile: " + strings.Join(names, ", ")
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

// awsProfileNames collects AWS profile names from ~/.aws/config and
// ~/.aws/credentials (config uses `[profile X]`, credentials use `[X]`),
// sorted and de-duplicated. Only names are read — never key material.
func awsProfileNames() []string {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	seen := map[string]struct{}{}
	for _, file := range []string{"config", "credentials"} {
		data, err := os.ReadFile(filepath.Join(home, ".aws", file))
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "[") || !strings.HasSuffix(line, "]") {
				continue
			}
			section := strings.TrimSuffix(strings.TrimPrefix(line, "["), "]")
			if strings.HasPrefix(section, "profile ") {
				section = strings.TrimSpace(strings.TrimPrefix(section, "profile "))
			}
			if section != "" {
				seen[section] = struct{}{}
			}
		}
	}
	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// detectAmbientVertex mirrors pi-ai google-vertex.js resolution: an ADC file
// (explicit GOOGLE_APPLICATION_CREDENTIALS or the default gcloud path) plus a
// project env var (GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT).
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
	return "gcloud application default credentials"
}

func envNonEmpty(name string) bool {
	return strings.TrimSpace(os.Getenv(name)) != ""
}
