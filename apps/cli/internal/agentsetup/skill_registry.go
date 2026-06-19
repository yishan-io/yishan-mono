package setup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"yishan/apps/cli/internal/config"
)

type InstalledSkillRecord struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Version     string          `json:"version"`
	Source      string          `json:"source"`
	SourceKind  SkillSourceKind `json:"sourceKind"`
	Official    bool            `json:"official"`
	InstalledAt string          `json:"installedAt"`
	UpdatedAt   string          `json:"updatedAt"`
}

type skillRegistry struct {
	Skills []InstalledSkillRecord `json:"skills"`
}

func loadSkillRegistry() (*skillRegistry, error) {
	path, err := skillRegistryPath()
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return &skillRegistry{Skills: []InstalledSkillRecord{}}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read skill registry: %w", err)
	}
	var registry skillRegistry
	if err := json.Unmarshal(content, &registry); err != nil {
		return nil, fmt.Errorf("decode skill registry: %w", err)
	}
	return &registry, nil
}

func saveSkillRegistry(registry *skillRegistry) error {
	path, err := skillRegistryPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create skill registry dir: %w", err)
	}
	sort.SliceStable(registry.Skills, func(i, j int) bool {
		if registry.Skills[i].Official != registry.Skills[j].Official {
			return registry.Skills[i].Official
		}
		return registry.Skills[i].Name < registry.Skills[j].Name
	})
	raw, err := json.MarshalIndent(registry, "", "  ")
	if err != nil {
		return fmt.Errorf("encode skill registry: %w", err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		return fmt.Errorf("write skill registry: %w", err)
	}
	return nil
}

func upsertInstalledSkill(record InstalledSkillRecord) error {
	registry, err := loadSkillRegistry()
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	for idx := range registry.Skills {
		if registry.Skills[idx].Name != record.Name {
			continue
		}
		record.InstalledAt = registry.Skills[idx].InstalledAt
		if record.InstalledAt == "" {
			record.InstalledAt = now
		}
		record.UpdatedAt = now
		registry.Skills[idx] = record
		return saveSkillRegistry(registry)
	}
	record.InstalledAt = now
	record.UpdatedAt = now
	registry.Skills = append(registry.Skills, record)
	return saveSkillRegistry(registry)
}

func removeInstalledSkill(name string) error {
	registry, err := loadSkillRegistry()
	if err != nil {
		return err
	}
	filtered := registry.Skills[:0]
	for _, record := range registry.Skills {
		if record.Name == name {
			continue
		}
		filtered = append(filtered, record)
	}
	registry.Skills = filtered
	return saveSkillRegistry(registry)
}

func installedSkillRecord(name string) (*InstalledSkillRecord, error) {
	registry, err := loadSkillRegistry()
	if err != nil {
		return nil, err
	}
	for _, record := range registry.Skills {
		if record.Name == name {
			recordCopy := record
			return &recordCopy, nil
		}
	}
	return nil, nil
}

func skillRegistryPath() (string, error) {
	yishanHome, err := config.HomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(yishanHome, "skills", "registry.json"), nil
}
