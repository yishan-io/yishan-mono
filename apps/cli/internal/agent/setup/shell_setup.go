package setup

import (
	"bytes"
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"text/template"
)

const pathEnsureFunctionName = "_yishan_ensure_wrapper_path"
const origZdotdirEnvKey = "YISHAN_ORIG_ZDOTDIR"

//go:embed assets/shell/zshenv.tmpl
var zshenvTemplate string

//go:embed assets/shell/zprofile.tmpl
var zprofileTemplate string

//go:embed assets/shell/zshrc.tmpl
var zshrcTemplate string

//go:embed assets/shell/zlogin.tmpl
var zloginTemplate string

//go:embed assets/shell/bash-rcfile.tmpl
var bashRcfileTemplate string

func ensureManagedShellSetup(managedRootDir string) error {
	managedBinDir := filepath.Join(managedRootDir, "bin")
	zshWrapperDir := filepath.Join(managedRootDir, "shell", "zsh")
	bashRcfilePath := filepath.Join(managedRootDir, "shell", "bash", "rcfile")

	if err := ensureZshWrapperFiles(zshWrapperDir, managedBinDir); err != nil {
		return fmt.Errorf("write zsh wrapper files: %w", err)
	}
	if err := ensureBashWrapperFile(bashRcfilePath, managedBinDir); err != nil {
		return fmt.Errorf("write bash wrapper file: %w", err)
	}
	return nil
}

func ensureZshWrapperFiles(zshWrapperDir string, managedBinDir string) error {
	data := shellTemplateData(zshWrapperDir, managedBinDir)
	zshenvScript := renderShellTemplate("zshenv", zshenvTemplate, data)
	if err := writeTextFileIfChanged(filepath.Join(zshWrapperDir, ".zshenv"), zshenvScript, 0o644); err != nil {
		return err
	}

	zprofileScript := renderShellTemplate("zprofile", zprofileTemplate, data)
	if err := writeTextFileIfChanged(filepath.Join(zshWrapperDir, ".zprofile"), zprofileScript, 0o644); err != nil {
		return err
	}

	zshrcScript := renderShellTemplate("zshrc", zshrcTemplate, data)
	if err := writeTextFileIfChanged(filepath.Join(zshWrapperDir, ".zshrc"), zshrcScript, 0o644); err != nil {
		return err
	}

	zloginScript := renderShellTemplate("zlogin", zloginTemplate, data)
	return writeTextFileIfChanged(filepath.Join(zshWrapperDir, ".zlogin"), zloginScript, 0o644)
}

func ensureBashWrapperFile(rcfilePath string, managedBinDir string) error {
	script := renderShellTemplate("bash-rcfile", bashRcfileTemplate, shellTemplateData("", managedBinDir))
	return writeTextFileIfChanged(rcfilePath, script, 0o644)
}

type shellTemplateInput struct {
	OrigZdotdirExpansion   string
	PathEnsureFunctionName string
	PathEnsureFunction     string
	QuotedZshWrapperDir    string
	ZshPrecmdHook          string
	BrowserOpenShim        string
}

func shellTemplateData(zshWrapperDir string, managedBinDir string) shellTemplateInput {
	return shellTemplateInput{
		OrigZdotdirExpansion:   "${" + origZdotdirEnvKey + ":-$HOME}",
		PathEnsureFunctionName: pathEnsureFunctionName,
		PathEnsureFunction:     buildPathEnsureFunction(managedBinDir),
		QuotedZshWrapperDir:    quoteShellPath(zshWrapperDir),
		ZshPrecmdHook:          buildZshPrecmdHook(),
		BrowserOpenShim:        buildBrowserOpenShim(),
	}
}

func renderShellTemplate(name string, source string, data shellTemplateInput) string {
	var rendered bytes.Buffer
	tmpl := template.Must(template.New(name).Parse(source))
	if err := tmpl.Execute(&rendered, data); err != nil {
		panic(err)
	}
	return rendered.String()
}

func buildPathEnsureFunction(managedBinDir string) string {
	quotedManagedBinDir := quoteShellPath(managedBinDir)
	return pathEnsureFunctionName + `() {
  local _yishan_target=` + quotedManagedBinDir + `
  local _yishan_head="${PATH%%:*}"
  if [[ "$_yishan_head" == "$_yishan_target" ]]; then
    return
  fi

  local _yishan_new_path=""
  local _yishan_segment=""
  local _yishan_old_ifs="$IFS"
  IFS=':'
  for _yishan_segment in $PATH; do
    if [[ -z "$_yishan_segment" || "$_yishan_segment" == "$_yishan_target" ]]; then
      continue
    fi
    if [[ -z "$_yishan_new_path" ]]; then
      _yishan_new_path="$_yishan_segment"
    else
      _yishan_new_path="${_yishan_new_path}:$_yishan_segment"
    fi
  done
  IFS="$_yishan_old_ifs"

  if [[ -n "$_yishan_new_path" ]]; then
    export PATH="${_yishan_target}:${_yishan_new_path}"
  else
    export PATH="$_yishan_target"
  fi
}
` + pathEnsureFunctionName
}

func buildZshPrecmdHook() string {
	return `typeset -ga precmd_functions 2>/dev/null || true
{
  precmd_functions=(${precmd_functions:#` + pathEnsureFunctionName + `} ` + pathEnsureFunctionName + `)
} 2>/dev/null || true`
}

func buildBrowserOpenShim() string {
	switch runtime.GOOS {
	case "darwin":
		return `# Route /usr/bin/open URL calls through the yishan wrapper.
/usr/bin/open() { command open "$@"; }`
	case "linux":
		return `# Route /usr/bin/xdg-open URL calls through the yishan wrapper.
/usr/bin/xdg-open() { command xdg-open "$@"; }`
	default:
		return ""
	}
}

func quoteShellPath(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func managedShellEnv(baseEnv []string, managedRootDir string, command string) []string {
	if managedRootDir == "" {
		return baseEnv
	}

	env := upsertSetupEnv(baseEnv, "PATH", prependPathValue(envValueOrDefault(baseEnv, "PATH", os.Getenv("PATH")), filepath.Join(managedRootDir, "bin")))
	shellName := filepath.Base(command)
	if shellName == "zsh" {
		managedZshDir := filepath.Join(managedRootDir, "shell", "zsh")
		// If ZDOTDIR already points to the managed wrapper directory (e.g.
		// daemon inherited it from a parent shell in dev mode), treat it as
		// unset and fall back to HOME to avoid a self-referential source
		// loop in .zshenv.
		origZdotdir := resolveOrigZdotdirValue(env, managedZshDir)
		env = upsertSetupEnv(env, origZdotdirEnvKey, origZdotdir)
		env = upsertSetupEnv(env, "ZDOTDIR", managedZshDir)
	}
	return env
}

// resolveOrigZdotdirValue returns the user's real ZDOTDIR. If the current
// ZDOTDIR already points to the managed wrapper directory, it is treated as
// unset and falls back to HOME.
func resolveOrigZdotdirValue(env []string, managedZshDir string) string {
	zdotdir := envValueOrDefault(env, "ZDOTDIR", "")
	if zdotdir == "" || zdotdir == managedZshDir {
		return envValueOrDefault(env, "HOME", os.Getenv("HOME"))
	}
	return zdotdir
}

func prependPathValue(pathValue string, directory string) string {
	if pathValue == "" {
		return directory
	}
	return directory + string(os.PathListSeparator) + pathValue
}

func envValueOrDefault(env []string, key string, fallback string) string {
	prefix := key + "="
	for _, entry := range env {
		if value, ok := strings.CutPrefix(entry, prefix); ok && strings.TrimSpace(value) != "" {
			return value
		}
	}
	return fallback
}

func upsertSetupEnv(env []string, key string, value string) []string {
	prefix := key + "="
	for index, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			env[index] = prefix + value
			return env
		}
	}
	return append(env, prefix+value)
}
