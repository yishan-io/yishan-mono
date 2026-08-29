package rpc

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// DSHPluginNameParams identifies one installed, daemon-managed DSH bundle.
type DSHPluginNameParams struct {
	Name string `json:"name"`
}

// DSHSetPluginEnabledParams changes an installed bundle's signed enabled flag.
type DSHSetPluginEnabledParams struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

// DSHPluginBundle is the bounded desktop representation of a signed bundle.
type DSHPluginBundle struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Enabled bool   `json:"enabled"`
}

// DSHPluginListResult lists the signature-verified managed bundle lock.
type DSHPluginListResult struct {
	Bundles []DSHPluginBundle `json:"bundles"`
}

// UnmarshalJSON rejects fields outside the managed-bundle identity contract.
func (p *DSHPluginNameParams) UnmarshalJSON(raw []byte) error {
	type wire DSHPluginNameParams
	return decodeStrictDSHPluginParams(raw, (*wire)(p))
}

// UnmarshalJSON rejects fields outside the signed enablement mutation contract
// and requires enabled, including when its value is false.
func (p *DSHSetPluginEnabledParams) UnmarshalJSON(raw []byte) error {
	var wire struct {
		Name    string `json:"name"`
		Enabled *bool  `json:"enabled"`
	}
	if err := decodeStrictDSHPluginParams(raw, &wire); err != nil {
		return err
	}
	if wire.Enabled == nil {
		return fmt.Errorf("enabled is required")
	}
	p.Name = wire.Name
	p.Enabled = *wire.Enabled
	return nil
}

func decodeStrictDSHPluginParams(raw []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return fmt.Errorf("unexpected trailing JSON value")
		}
		return err
	}
	return nil
}

// DSHPluginCatalogBundle is one daemon-authorized official DSH Loader bundle.
type DSHPluginCatalogBundle struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// DSHPluginCatalogResult lists installable official DSH Loader bundles.
type DSHPluginCatalogResult struct {
	Bundles []DSHPluginCatalogBundle `json:"bundles"`
}

// DSHLocalPluginRegisterParams identifies an explicit Developer Mode bundle path.
type DSHLocalPluginRegisterParams struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

// DSHLocalPluginNameParams identifies an explicit local bundle registration.
type DSHLocalPluginNameParams struct {
	ID string `json:"id"`
}

// DSHLocalPluginBundle is an explicitly registered Developer Mode bundle.
type DSHLocalPluginBundle struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

// DSHLocalPluginListResult lists explicit Developer Mode bundle registrations.
type DSHLocalPluginListResult struct {
	Bundles []DSHLocalPluginBundle `json:"bundles"`
}

func (p *DSHLocalPluginRegisterParams) UnmarshalJSON(raw []byte) error {
	type wire DSHLocalPluginRegisterParams
	return decodeStrictDSHPluginParams(raw, (*wire)(p))
}
func (p *DSHLocalPluginNameParams) UnmarshalJSON(raw []byte) error {
	type wire DSHLocalPluginNameParams
	return decodeStrictDSHPluginParams(raw, (*wire)(p))
}
