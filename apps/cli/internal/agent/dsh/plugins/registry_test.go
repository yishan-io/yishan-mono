package plugins

import "testing"

func TestHTTPRegistryBundleURL_OfficialScopedLoaderBundles(t *testing.T) {
	tests := []struct {
		name        string
		packageName string
		want        string
	}{
		{
			name:        "base",
			packageName: "@deepseek-ai/dsh-base",
			want:        "https://registry.npmjs.org/@deepseek-ai%2Fdsh-base/0.1.1-rc.2",
		},
		{
			name:        "headless",
			packageName: "@deepseek-ai/dsh-headless",
			want:        "https://registry.npmjs.org/@deepseek-ai%2Fdsh-headless/0.1.1-rc.2",
		},
		{
			name:        "web app",
			packageName: "@deepseek-ai/dsh-web-app",
			want:        "https://registry.npmjs.org/@deepseek-ai%2Fdsh-web-app/0.1.1-rc.2",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			endpoint, err := (HTTPRegistry{BaseURL: "https://registry.npmjs.org"}).bundleURL(Request{
				Name:    test.packageName,
				Version: "0.1.1-rc.2",
			})
			if err != nil {
				t.Fatalf("bundleURL = %v", err)
			}
			if endpoint != test.want {
				t.Fatalf("bundleURL = %q, want %q", endpoint, test.want)
			}
		})
	}
}
