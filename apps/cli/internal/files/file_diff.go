package files

import (
	"yishan/apps/cli/internal/git"
	gitexec "yishan/apps/cli/internal/git/exec"

	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var skippedDiffExtensions = map[string]struct{}{
	".7z":    {},
	".a":     {},
	".ai":    {},
	".avif":  {},
	".bin":   {},
	".bmp":   {},
	".class": {},
	".dll":   {},
	".dmg":   {},
	".doc":   {},
	".docx":  {},
	".exe":   {},
	".gif":   {},
	".gz":    {},
	".heic":  {},
	".heif":  {},
	".ico":   {},
	".jar":   {},
	".jpeg":  {},
	".jpg":   {},
	".lockb": {},
	".m4a":   {},
	".mkv":   {},
	".mov":   {},
	".mp3":   {},
	".mp4":   {},
	".o":     {},
	".ogg":   {},
	".otf":   {},
	".pdf":   {},
	".png":   {},
	".pyc":   {},
	".so":    {},
	".tar":   {},
	".tif":   {},
	".tiff":  {},
	".ttf":   {},
	".wav":   {},
	".webm":  {},
	".webp":  {},
	".woff":  {},
	".woff2": {},
	".xls":   {},
	".xlsx":  {},
	".zip":   {},
}

func (s *FileService) ReadDiff(ctx context.Context, root string, path string) (git.GitDiffContent, error) {
	fullPath, err := safeJoin(root, path, false)
	if err != nil {
		return git.GitDiffContent{}, err
	}

	fileInfo, err := os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return s.readDiffForDeletedFile(ctx, root, fullPath)
		}
		return git.GitDiffContent{}, err
	}

	if shouldSkipDiff(fullPath, fileInfo) {
		return git.GitDiffContent{ShouldSkipDecorations: true}, nil
	}

	relPath, err := filepath.Rel(root, fullPath)
	if err != nil {
		return git.GitDiffContent{}, err
	}

	oldContent := gitCommandOutput(ctx, root, "show", fmt.Sprintf("HEAD:%s", relPath))

	newBytes, readErr := os.ReadFile(fullPath)
	if readErr != nil {
		if os.IsNotExist(readErr) {
			return git.GitDiffContent{OldContent: oldContent, NewContent: ""}, nil
		}
		return git.GitDiffContent{}, readErr
	}

	if bytes.IndexByte(newBytes, 0) >= 0 {
		return git.GitDiffContent{ShouldSkipDecorations: true}, nil
	}

	return git.GitDiffContent{OldContent: oldContent, NewContent: string(newBytes)}, nil
}

func (s *FileService) readDiffForDeletedFile(ctx context.Context, root string, fullPath string) (git.GitDiffContent, error) {
	relPath, err := filepath.Rel(root, fullPath)
	if err != nil {
		return git.GitDiffContent{}, err
	}

	oldContent := gitCommandOutput(ctx, root, "show", fmt.Sprintf("HEAD:%s", relPath))
	return git.GitDiffContent{OldContent: oldContent, NewContent: ""}, nil
}

func shouldSkipDiff(fullPath string, fileInfo os.FileInfo) bool {
	if fileInfo.IsDir() {
		return true
	}

	if fileInfo.Size() > maxDiffFileBytes {
		return true
	}

	if _, ok := skippedDiffExtensions[strings.ToLower(filepath.Ext(fullPath))]; ok {
		return true
	}

	return false
}

// gitCommandOutput runs a git command best-effort and returns its stdout (or
// empty on failure) — used for diff content reads where a missing object is
// expected (e.g. a deleted or untracked file).
func gitCommandOutput(ctx context.Context, root string, args ...string) string {
	out, _, ok := gitexec.DefaultRunner().Run(ctx, root, args...)
	if !ok {
		return ""
	}
	return string(out)
}
