package daemon

import (
	"os"
	"path/filepath"
	"testing"
)

const ambientTestAWSCreds = "[default]\naws_access_key_id = test\naws_secret_access_key = test\n"

func TestDetectAmbientBedrock(t *testing.T) {

	t.Run("bearer token env", func(t *testing.T) {
		t.Setenv("AWS_BEARER_TOKEN_BEDROCK", "token")
		if got := detectAmbientBedrock(); got != "AWS_BEARER_TOKEN_BEDROCK" {
			t.Fatalf("source = %q, want AWS_BEARER_TOKEN_BEDROCK", got)
		}
	})

	t.Run("aws profile env", func(t *testing.T) {
		t.Setenv("AWS_BEARER_TOKEN_BEDROCK", "")
		t.Setenv("AWS_PROFILE", "sandbox")
		if got := detectAmbientBedrock(); got != "AWS_PROFILE: sandbox" {
			t.Fatalf("source = %q, want AWS_PROFILE: sandbox", got)
		}
	})

	t.Run("credentials file with profile", func(t *testing.T) {
		t.Setenv("AWS_BEARER_TOKEN_BEDROCK", "")
		t.Setenv("AWS_PROFILE", "")
		home := t.TempDir()
		t.Setenv("HOME", home)
		if err := os.MkdirAll(filepath.Join(home, ".aws"), 0o700); err != nil {
			t.Fatalf("mkdir .aws: %v", err)
		}
		if err := os.WriteFile(filepath.Join(home, ".aws", "credentials"), []byte(ambientTestAWSCreds), 0o600); err != nil {
			t.Fatalf("write credentials: %v", err)
		}
		if got := detectAmbientBedrock(); got != "AWS profile: default" {
			t.Fatalf("source = %q, want AWS profile: default", got)
		}
	})

	t.Run("config-only profile", func(t *testing.T) {
		t.Setenv("AWS_BEARER_TOKEN_BEDROCK", "")
		t.Setenv("AWS_PROFILE", "")
		home := t.TempDir()
		t.Setenv("HOME", home)
		if err := os.MkdirAll(filepath.Join(home, ".aws"), 0o700); err != nil {
		t.Fatalf("mkdir .aws: %v", err)
		}
		// A profile defined only in config (e.g. SSO/role) is still usable.
		if err := os.WriteFile(filepath.Join(home, ".aws", "config"), []byte("[profile ai-bedrock]\nregion = us-east-1\n"), 0o600); err != nil {
			t.Fatalf("write config: %v", err)
		}
		if got := detectAmbientBedrock(); got != "AWS profile: ai-bedrock" {
			t.Fatalf("source = %q, want AWS profile: ai-bedrock", got)
		}
	})

	t.Run("access keys", func(t *testing.T) {
		t.Setenv("AWS_BEARER_TOKEN_BEDROCK", "")
		t.Setenv("AWS_PROFILE", "")
		t.Setenv("AWS_ACCESS_KEY_ID", "AKIA...")
		t.Setenv("AWS_SECRET_ACCESS_KEY", "secret")
		t.Setenv("HOME", t.TempDir())
		if got := detectAmbientBedrock(); got != "AWS access keys" {
			t.Fatalf("source = %q, want AWS access keys", got)
		}
	})

	t.Run("ecs task role", func(t *testing.T) {
		t.Setenv("AWS_BEARER_TOKEN_BEDROCK", "")
		t.Setenv("AWS_PROFILE", "")
		t.Setenv("AWS_ACCESS_KEY_ID", "")
		t.Setenv("AWS_SECRET_ACCESS_KEY", "")
		t.Setenv("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "/v2/credentials")
		t.Setenv("HOME", t.TempDir())
		if got := detectAmbientBedrock(); got != "ECS task role" {
			t.Fatalf("source = %q, want ECS task role", got)
		}
	})

	t.Run("web identity token", func(t *testing.T) {
		t.Setenv("AWS_BEARER_TOKEN_BEDROCK", "")
		t.Setenv("AWS_PROFILE", "")
		t.Setenv("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "")
		t.Setenv("AWS_WEB_IDENTITY_TOKEN_FILE", "/tmp/token")
		t.Setenv("HOME", t.TempDir())
		if got := detectAmbientBedrock(); got != "web identity token" {
			t.Fatalf("source = %q, want web identity token", got)
		}
	})

	t.Run("nothing configured", func(t *testing.T) {
		for _, name := range []string{
			"AWS_BEARER_TOKEN_BEDROCK", "AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
			"AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_WEB_IDENTITY_TOKEN_FILE",
		} {
			t.Setenv(name, "")
		}
		t.Setenv("HOME", t.TempDir())
		if got := detectAmbientBedrock(); got != "" {
			t.Fatalf("source = %q, want empty", got)
		}
	})
}

func TestDetectAmbientVertex(t *testing.T) {

	t.Run("default ADC file with project", func(t *testing.T) {
		home := t.TempDir()
		t.Setenv("HOME", home)
		t.Setenv("GOOGLE_APPLICATION_CREDENTIALS", "")
		t.Setenv("GOOGLE_CLOUD_PROJECT", "my-project")
		adcDir := filepath.Join(home, ".config", "gcloud")
		if err := os.MkdirAll(adcDir, 0o700); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(adcDir, vertexDefaultADCFile), []byte("{}"), 0o600); err != nil {
			t.Fatalf("write adc: %v", err)
		}
		if got := detectAmbientVertex(); got != "gcloud application default credentials" {
			t.Fatalf("source = %q, want gcloud ADC", got)
		}
	})

	t.Run("explicit ADC file", func(t *testing.T) {
		adcPath := filepath.Join(t.TempDir(), "service-account.json")
		if err := os.WriteFile(adcPath, []byte("{}"), 0o600); err != nil {
			t.Fatalf("write adc: %v", err)
		}
		t.Setenv("GOOGLE_APPLICATION_CREDENTIALS", adcPath)
		t.Setenv("GOOGLE_CLOUD_PROJECT", "my-project")
		t.Setenv("GCLOUD_PROJECT", "")
		t.Setenv("HOME", t.TempDir())
		if got := detectAmbientVertex(); got != "gcloud application default credentials" {
			t.Fatalf("source = %q, want gcloud ADC", got)
		}
	})

	t.Run("no project env", func(t *testing.T) {
		home := t.TempDir()
		t.Setenv("HOME", home)
		t.Setenv("GOOGLE_APPLICATION_CREDENTIALS", "")
		t.Setenv("GOOGLE_CLOUD_PROJECT", "")
		t.Setenv("GCLOUD_PROJECT", "")
		adcDir := filepath.Join(home, ".config", "gcloud")
		if err := os.MkdirAll(adcDir, 0o700); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(adcDir, vertexDefaultADCFile), []byte("{}"), 0o600); err != nil {
			t.Fatalf("write adc: %v", err)
		}
		if got := detectAmbientVertex(); got != "" {
			t.Fatalf("source = %q, want empty without project", got)
		}
	})

	t.Run("nothing configured", func(t *testing.T) {
		t.Setenv("GOOGLE_APPLICATION_CREDENTIALS", "")
		t.Setenv("GOOGLE_CLOUD_PROJECT", "")
		t.Setenv("GCLOUD_PROJECT", "")
		t.Setenv("HOME", t.TempDir())
		if got := detectAmbientVertex(); got != "" {
			t.Fatalf("source = %q, want empty", got)
		}
	})
}

func TestPiAuthStore_ListIncludesAmbientProviders(t *testing.T) {
	store, dir := newTestPiAuthStore(t)
	// Restore the real detector; control the host environment via HOME.
	store.ambientDetector = detectAmbientProviderAuth
	home := t.TempDir()
	t.Setenv("HOME", home)
	for _, name := range []string{
		"AWS_BEARER_TOKEN_BEDROCK", "AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
		"AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_WEB_IDENTITY_TOKEN_FILE",
		"GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT",
	} {
		t.Setenv(name, "")
	}
	t.Setenv("AWS_PROFILE", "sandbox")

	entries, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	byProvider := map[string]piProviderEntry{}
	for _, entry := range entries {
		byProvider[entry.Provider] = entry
	}
	bedrock, ok := byProvider["amazon-bedrock"]
	if !ok || bedrock.Type != "ambient" || bedrock.Source != "AWS_PROFILE: sandbox" {
		t.Fatalf("amazon-bedrock entry = %+v, want ambient/AWS_PROFILE: sandbox", byProvider["amazon-bedrock"])
	}
	if _, ok := byProvider["google-vertex"]; ok {
		t.Fatalf("google-vertex should not appear without ADC credentials")
	}

	// A stored credential wins over the ambient source.
	writeAuthFile(t, dir, `{"amazon-bedrock": {"type": "api_key", "key": "sk-bedrock"}}`)
	entries, err = store.List()
	if err != nil {
		t.Fatalf("List with stored credential: %v", err)
	}
	byProvider = map[string]piProviderEntry{}
	for _, entry := range entries {
		byProvider[entry.Provider] = entry
	}
	if entry := byProvider["amazon-bedrock"]; entry.Type != "api_key" || entry.Source != "" {
		t.Fatalf("stored amazon-bedrock should win over ambient, got %+v", entry)
	}
}
