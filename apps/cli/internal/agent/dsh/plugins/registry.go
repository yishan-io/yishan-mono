package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

var npmNamePattern = regexp.MustCompile(`^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$`)

// HTTPRegistry resolves package versions through the npm registry API.
type HTTPRegistry struct {
	BaseURL string
	Client  *http.Client
}

// ResolveBundle obtains immutable tarball metadata for daemon-side allowlist verification.
func (r HTTPRegistry) ResolveBundle(ctx context.Context, request Request) (Bundle, error) {
	if err := validateRequest(request); err != nil {
		return Bundle{}, err
	}
	endpoint, err := r.bundleURL(request)
	if err != nil {
		return Bundle{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Bundle{}, fmt.Errorf("build npm registry request: %w", err)
	}
	response, err := secureClient(r.client()).Do(req)
	if err != nil {
		return Bundle{}, fmt.Errorf("fetch npm registry metadata: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return Bundle{}, fmt.Errorf("npm registry responded %d", response.StatusCode)
	}
	return decodeBundle(response.Body)
}

func (r HTTPRegistry) bundleURL(request Request) (string, error) {
	base, err := url.Parse(r.BaseURL)
	if err != nil || base.Scheme != "https" || base.Host == "" {
		return "", fmt.Errorf("invalid npm registry URL")
	}
	basePath := strings.TrimSuffix(base.Path, "/")
	rawBasePath := strings.TrimSuffix(base.EscapedPath(), "/")
	base.Path = basePath + "/" + request.Name + "/" + request.Version
	base.RawPath = rawBasePath + "/" + url.PathEscape(request.Name) + "/" + url.PathEscape(request.Version)
	return base.String(), nil
}

func (r HTTPRegistry) client() *http.Client {
	if r.Client != nil {
		return r.Client
	}
	return http.DefaultClient
}

func decodeBundle(body io.Reader) (Bundle, error) {
	var metadata struct {
		Name    string                              `json:"name"`
		Version string                              `json:"version"`
		Dist    struct{ Tarball, Integrity string } `json:"dist"`
	}
	if err := json.NewDecoder(io.LimitReader(body, 1<<20)).Decode(&metadata); err != nil {
		return Bundle{}, fmt.Errorf("decode npm registry metadata: %w", err)
	}
	return Bundle{Name: metadata.Name, Version: metadata.Version, TarballURL: metadata.Dist.Tarball, Integrity: metadata.Dist.Integrity}, nil
}

// HTTPDownloader downloads HTTPS tarballs with the archive-size bound.
type HTTPDownloader struct{ Client *http.Client }

func (d HTTPDownloader) Download(ctx context.Context, source string) ([]byte, error) {
	parsed, err := url.Parse(source)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return nil, fmt.Errorf("invalid npm tarball URL")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, fmt.Errorf("build tarball request: %w", err)
	}
	response, err := secureClient(d.client()).Do(request)
	if err != nil {
		return nil, fmt.Errorf("download tarball: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tarball server responded %d", response.StatusCode)
	}
	return readBounded(response.Body)
}

func (d HTTPDownloader) client() *http.Client {
	if d.Client != nil {
		return d.Client
	}
	return http.DefaultClient
}

func readBounded(body io.Reader) ([]byte, error) {
	content, err := io.ReadAll(io.LimitReader(body, maxArchiveBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read tarball: %w", err)
	}
	if len(content) > maxArchiveBytes {
		return nil, fmt.Errorf("%w: compressed size exceeds limit", ErrInvalidArchive)
	}
	return content, nil
}

func validateRequest(request Request) error {
	if !npmNamePattern.MatchString(request.Name) || strings.TrimSpace(request.Version) == "" || strings.ContainsAny(request.Version, "/\\") {
		return fmt.Errorf("%w: invalid package request", ErrInvalidArchive)
	}
	return nil
}

func secureClient(client *http.Client) *http.Client {
	secure := *client
	secure.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if request.URL.Scheme != "https" || request.URL.Host == "" {
			return fmt.Errorf("redirect to non-HTTPS URL is forbidden")
		}
		return nil
	}
	return &secure
}
