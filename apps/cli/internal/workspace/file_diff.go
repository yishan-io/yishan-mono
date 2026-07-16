package workspace

import (
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

func (s *FileService) ReadDiff(ctx context.Context, root string, path string) (GitDiffContent, error) {
	fullPath, err := safeJoin(root, path, false)
	if err != nil {
		return GitDiffContent{}, err
	}

	fileInfo, err := os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return s.readDiffForDeletedFile(ctx, root, fullPath)
		}
		return GitDiffContent{}, err
	}

	if shouldSkipDiff(fullPath, fileInfo) {
		return GitDiffContent{ShouldSkipDecorations: true}, nil
	}

	relPath, err := filepath.Rel(root, fullPath)
	if err != nil {
		return GitDiffContent{}, err
	}

	oldContent, _ := gitCommand(ctx, root, "show", fmt.Sprintf("HEAD:%s", relPath))

	newBytes, readErr := os.ReadFile(fullPath)
	if readErr != nil {
		if os.IsNotExist(readErr) {
			return GitDiffContent{OldContent: oldContent, NewContent: ""}, nil
		}
		return GitDiffContent{}, readErr
	}

	if bytes.IndexByte(newBytes, 0) >= 0 {
		return GitDiffContent{ShouldSkipDecorations: true}, nil
	}

	return GitDiffContent{OldContent: oldContent, NewContent: string(newBytes)}, nil
}

func (s *FileService) readDiffForDeletedFile(ctx context.Context, root string, fullPath string) (GitDiffContent, error) {
	relPath, err := filepath.Rel(root, fullPath)
	if err != nil {
		return GitDiffContent{}, err
	}

	oldContent, _ := gitCommand(ctx, root, "show", fmt.Sprintf("HEAD:%s", relPath))
	return GitDiffContent{OldContent: oldContent, NewContent: ""}, nil
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
