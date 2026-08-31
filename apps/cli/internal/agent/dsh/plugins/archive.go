package plugins

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

type extractState struct {
	files          []FileHash
	seen           map[string]bool
	total          int64
	headers        int
	hasPackageRoot bool
}
type boundedReader struct {
	reader    io.Reader
	remaining int64
}

func (r *boundedReader) Read(buffer []byte) (int, error) {
	if r.remaining == 0 {
		var probe [1]byte
		count, err := r.reader.Read(probe[:])
		if count > 0 {
			return 0, fmt.Errorf("%w: decompressed size exceeds limit", ErrInvalidArchive)
		}
		return 0, err
	}
	if int64(len(buffer)) > r.remaining {
		buffer = buffer[:r.remaining]
	}
	count, err := r.reader.Read(buffer)
	r.remaining -= int64(count)
	return count, err
}

func extractBundle(stage string, bundle Bundle, archive []byte) (Plugin, error) {
	gzipReader, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return Plugin{}, fmt.Errorf("%w: open gzip: %w", ErrInvalidArchive, err)
	}
	defer gzipReader.Close()
	bounded := &boundedReader{reader: gzipReader, remaining: maxDecompressedBytes}
	state, err := extractTar(stage, tar.NewReader(bounded))
	if err != nil {
		return Plugin{}, err
	}
	if _, err := io.Copy(io.Discard, bounded); err != nil {
		return Plugin{}, err
	}
	if !state.hasPackageRoot || len(state.files) == 0 {
		return Plugin{}, fmt.Errorf("%w: archive lacks package root or files", ErrInvalidArchive)
	}
	if err := rejectLifecycleScripts(stage); err != nil {
		return Plugin{}, err
	}
	return Plugin{Name: bundle.Name, Version: bundle.Version, Enabled: true, TreeSHA256: hashTree(state.files)}, nil
}

func extractTar(stage string, reader *tar.Reader) (extractState, error) {
	state := extractState{seen: make(map[string]bool)}
	for {
		header, err := reader.Next()
		if err == io.EOF {
			return state, nil
		}
		if err != nil {
			return extractState{}, fmt.Errorf("%w: read tar: %w", ErrInvalidArchive, err)
		}
		if err := validateHeader(&state, header); err != nil {
			return extractState{}, err
		}
		relative, isRoot, err := archivePath(header.Name)
		if err != nil {
			return extractState{}, err
		}
		if isRoot {
			if header.Typeflag != tar.TypeDir {
				return extractState{}, fmt.Errorf("%w: package root is not a directory", ErrInvalidArchive)
			}
			state.hasPackageRoot = true
			continue
		}
		if state.seen[relative] {
			return extractState{}, fmt.Errorf("%w: duplicate path %q", ErrInvalidArchive, relative)
		}
		state.seen[relative] = true
		if err := extractEntry(stage, relative, header, reader, &state); err != nil {
			return extractState{}, err
		}
	}
}

func validateHeader(state *extractState, header *tar.Header) error {
	state.headers++
	if state.headers > maxTarHeaders || header.Size < 0 || header.Size > maxDecompressedBytes {
		return fmt.Errorf("%w: tar header limit", ErrInvalidArchive)
	}
	if header.Typeflag != tar.TypeReg && header.Typeflag != 0 && header.Size != 0 {
		return fmt.Errorf("%w: non-regular entry has content", ErrInvalidArchive)
	}
	return nil
}

func archivePath(name string) (string, bool, error) {
	clean := path.Clean(name)
	if strings.HasPrefix(name, "/") || clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", false, fmt.Errorf("%w: unsafe path %q", ErrInvalidArchive, name)
	}
	if clean == "package" {
		return "", true, nil
	}
	relative, found := strings.CutPrefix(clean, "package/")
	if !found || relative == "" || strings.Contains(relative, "\\") {
		return "", false, fmt.Errorf("%w: npm archive entry outside package root", ErrInvalidArchive)
	}
	return relative, false, nil
}

func extractEntry(stage, relative string, header *tar.Header, reader io.Reader, state *extractState) error {
	target := filepath.Join(stage, filepath.FromSlash(relative))
	switch header.Typeflag {
	case tar.TypeDir:
		return os.MkdirAll(target, 0o755)
	case tar.TypeReg, 0:
		if state.total+header.Size > maxDecompressedBytes || len(state.files) >= maxTreeFiles {
			return fmt.Errorf("%w: expanded archive limit", ErrInvalidArchive)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return fmt.Errorf("create bundle directory: %w", err)
		}
		file, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
		if err != nil {
			return fmt.Errorf("create bundle file: %w", err)
		}
		hash, copyErr := copyAndHash(file, reader, header.Size)
		closeErr := file.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return fmt.Errorf("close bundle file: %w", closeErr)
		}
		state.total += header.Size
		state.files = append(state.files, FileHash{Path: relative, SHA256: hash})
		return nil
	default:
		return fmt.Errorf("%w: archive entry type %d is forbidden", ErrInvalidArchive, header.Typeflag)
	}
}

func copyAndHash(file *os.File, reader io.Reader, size int64) (string, error) {
	hash := sha256.New()
	if _, err := io.CopyN(io.MultiWriter(file, hash), reader, size); err != nil {
		return "", fmt.Errorf("%w: extract file: %w", ErrInvalidArchive, err)
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
func hashTree(files []FileHash) string {
	sorted := append([]FileHash(nil), files...)
	sort.Slice(sorted, func(a, b int) bool { return sorted[a].Path < sorted[b].Path })
	encoded, _ := json.Marshal(sorted)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}
func rejectLifecycleScripts(stage string) error {
	content, err := os.ReadFile(filepath.Join(stage, "package.json"))
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read bundle manifest: %w", err)
	}
	var manifest struct {
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal(content, &manifest); err != nil {
		return fmt.Errorf("%w: decode package manifest: %w", ErrInvalidArchive, err)
	}
	for _, name := range []string{"preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare", "postprepare"} {
		if manifest.Scripts[name] != "" {
			return fmt.Errorf("%w: lifecycle script %q is forbidden", ErrInvalidArchive, name)
		}
	}
	return nil
}
