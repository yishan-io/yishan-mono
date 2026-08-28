package dsh

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

const credentialsFileName = ".credentials.yaml"

var credRefPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// CredentialEntry is one stored API key reference.
type CredentialEntry struct {
	Ref   string `json:"ref"`
	Value string `json:"value"`
}

// credentialsFile mirrors the on-disk YAML layout.
type credentialsFile struct {
	Version int               `yaml:"version"`
	Refs    map[string]string `yaml:"refs"`
}

// CredentialStore reads and writes the DSH .credentials.yaml file.
type CredentialStore struct {
	path string
}

// NewCredentialStore returns a store backed by the given DSH data directory.
func NewCredentialStore(dshDataDir string) *CredentialStore {
	return &CredentialStore{path: filepath.Join(dshDataDir, credentialsFileName)}
}

// List returns all stored credential entries without exposing key values.
func (s *CredentialStore) List() ([]string, error) {
	cf, err := s.read()
	if err != nil {
		return nil, err
	}
	refs := make([]string, 0, len(cf.Refs))
	for ref := range cf.Refs {
		refs = append(refs, ref)
	}
	return refs, nil
}

// Save upserts one API key credential. ref must match [A-Za-z_][A-Za-z0-9_]*.
func (s *CredentialStore) Save(ref, value string) error {
	if !credRefPattern.MatchString(ref) {
		return fmt.Errorf("invalid credential ref %q: must match [A-Za-z_][A-Za-z0-9_]*", ref)
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return errors.New("credential value must not be empty")
	}
	cf, err := s.read()
	if err != nil {
		return err
	}
	if cf.Refs == nil {
		cf.Refs = make(map[string]string)
	}
	cf.Refs[ref] = value
	return s.write(cf)
}

// Remove deletes one credential entry. Removing an absent ref is a no-op.
func (s *CredentialStore) Remove(ref string) error {
	cf, err := s.read()
	if err != nil {
		return err
	}
	delete(cf.Refs, ref)
	return s.write(cf)
}

func (s *CredentialStore) read() (credentialsFile, error) {
	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return credentialsFile{Version: 1, Refs: map[string]string{}}, nil
	}
	if err != nil {
		return credentialsFile{}, fmt.Errorf("read dsh credentials: %w", err)
	}
	var cf credentialsFile
	if err := yaml.Unmarshal(data, &cf); err != nil {
		return credentialsFile{}, fmt.Errorf("parse dsh credentials: %w", err)
	}
	if cf.Refs == nil {
		cf.Refs = map[string]string{}
	}
	return cf, nil
}

func (s *CredentialStore) write(cf credentialsFile) error {
	cf.Version = 1
	data, err := yaml.Marshal(cf)
	if err != nil {
		return fmt.Errorf("marshal dsh credentials: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return fmt.Errorf("create dsh data dir: %w", err)
	}
	if err := os.WriteFile(s.path, data, 0o600); err != nil {
		return fmt.Errorf("write dsh credentials: %w", err)
	}
	return nil
}
