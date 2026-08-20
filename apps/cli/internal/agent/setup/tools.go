package setup

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"yishan/apps/cli/internal/platform/config"
)

const (
	toolCatalogCommand = "yishan-tool-catalog"
	toolCatalogMarker  = "__YISHAN_TOOL_CATALOG__:"
	toolCatalogTTL     = time.Minute
)

var (
	toolCatalogLoader  = loadPiToolCatalog
	toolCatalogTimeout = 15 * time.Second
)

var piToolCatalogCache struct {
	sync.RWMutex
	tools      []string
	expiresAt  time.Time
	generation uint64
	loading    chan struct{}
}

// ListPiTools returns the current names registered by the managed Pi runtime.
func ListPiTools(ctx context.Context) ([]string, error) {
	for {
		tools, loading := cachedPiTools()
		if tools != nil {
			return tools, nil
		}
		if loading != nil {
			if err := waitForToolCatalog(ctx, loading); err != nil {
				return nil, err
			}
			continue
		}
		return loadAndCachePiTools(ctx)
	}
}

func cachedPiTools() ([]string, chan struct{}) {
	piToolCatalogCache.RLock()
	defer piToolCatalogCache.RUnlock()
	if time.Now().Before(piToolCatalogCache.expiresAt) {
		return append([]string(nil), piToolCatalogCache.tools...), nil
	}
	return nil, piToolCatalogCache.loading
}

func waitForToolCatalog(ctx context.Context, loading <-chan struct{}) error {
	select {
	case <-loading:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("wait for pi tool catalog: %w", ctx.Err())
	}
}

func loadAndCachePiTools(ctx context.Context) ([]string, error) {
	loading, generation := beginPiToolCatalogLoad()
	if loading == nil {
		return ListPiTools(ctx)
	}
	tools, err := toolCatalogLoader(ctx)
	finishPiToolCatalogLoad(loading, generation, tools, err)
	if err != nil {
		return nil, fmt.Errorf("load pi tool catalog: %w", err)
	}
	if !isPiToolCatalogGenerationCurrent(generation) {
		return ListPiTools(ctx)
	}
	return append([]string(nil), tools...), nil
}

func isPiToolCatalogGenerationCurrent(generation uint64) bool {
	piToolCatalogCache.RLock()
	defer piToolCatalogCache.RUnlock()
	return generation == piToolCatalogCache.generation
}

func beginPiToolCatalogLoad() (chan struct{}, uint64) {
	piToolCatalogCache.Lock()
	defer piToolCatalogCache.Unlock()
	if piToolCatalogCache.loading != nil {
		return nil, 0
	}
	loading := make(chan struct{})
	piToolCatalogCache.loading = loading
	return loading, piToolCatalogCache.generation
}

func finishPiToolCatalogLoad(loading chan struct{}, generation uint64, tools []string, err error) {
	piToolCatalogCache.Lock()
	defer piToolCatalogCache.Unlock()
	if err == nil && generation == piToolCatalogCache.generation {
		piToolCatalogCache.tools = append([]string(nil), tools...)
		piToolCatalogCache.expiresAt = time.Now().Add(toolCatalogTTL)
	}
	piToolCatalogCache.loading = nil
	close(loading)
}

// InvalidatePiToolCatalog discards tool data after a successful extension mutation.
func InvalidatePiToolCatalog() {
	piToolCatalogCache.Lock()
	defer piToolCatalogCache.Unlock()
	piToolCatalogCache.generation++
	piToolCatalogCache.tools = nil
	piToolCatalogCache.expiresAt = time.Time{}
}

func loadPiToolCatalog(ctx context.Context) ([]string, error) {
	collectorPath, err := writeToolCatalogCollector()
	if err != nil {
		return nil, err
	}
	defer os.Remove(collectorPath) // best-effort cleanup after every subprocess outcome
	return runToolCatalogCollector(ctx, collectorPath)
}

func writeToolCatalogCollector() (string, error) {
	collector, err := os.CreateTemp("", "yishan-tool-catalog-*.ts")
	if err != nil {
		return "", fmt.Errorf("create pi tool catalog collector: %w", err)
	}
	if _, err := collector.WriteString(toolCatalogExtension); err != nil {
		_ = collector.Close() // best-effort cleanup before removing the collector
		_ = os.Remove(collector.Name())
		return "", fmt.Errorf("write pi tool catalog collector: %w", err)
	}
	if err := collector.Close(); err != nil {
		_ = os.Remove(collector.Name())
		return "", fmt.Errorf("close pi tool catalog collector: %w", err)
	}
	return collector.Name(), nil
}

func runToolCatalogCollector(ctx context.Context, collectorPath string) ([]string, error) {
	commandCtx, cancel := context.WithTimeout(ctx, toolCatalogTimeout)
	defer cancel()
	cmd, err := newPiCommand(commandCtx, "--mode", "rpc", "--no-session", "--no-context-files", "--extension", collectorPath)
	if err != nil {
		return nil, fmt.Errorf("start pi tool catalog: %w", err)
	}
	agentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, fmt.Errorf("resolve pi tool catalog directory: %w", err)
	}
	cmd.Dir = agentDir
	cmd.Stdin = strings.NewReader(`{"type":"prompt","message":"/yishan-tool-catalog"}`)
	output, err := cmd.CombinedOutput()
	if err != nil {
		if commandCtx.Err() != nil {
			return nil, fmt.Errorf("run pi tool catalog timed out: %w", commandCtx.Err())
		}
		return nil, fmt.Errorf("run pi tool catalog: %w: %s", err, strings.TrimSpace(string(output)))
	}
	tools, err := parsePiToolCatalog(output)
	if err != nil {
		return nil, fmt.Errorf("parse pi tool catalog: %w", err)
	}
	return tools, nil
}

func parsePiToolCatalog(output []byte) ([]string, error) {
	line := ""
	for candidate := range strings.SplitSeq(string(output), "\n") {
		if value, found := strings.CutPrefix(candidate, toolCatalogMarker); found {
			line = value
		}
	}
	if line == "" {
		return nil, fmt.Errorf("collector marker not found")
	}
	var names []string
	if err := json.Unmarshal([]byte(line), &names); err != nil {
		return nil, fmt.Errorf("decode collector tools: %w", err)
	}
	return normalizeToolNames(names)
}

func normalizeToolNames(names []string) ([]string, error) {
	seen := make(map[string]bool, len(names))
	tools := make([]string, 0, len(names))
	for _, name := range names {
		if strings.TrimSpace(name) == "" {
			return nil, fmt.Errorf("collector returned an empty tool name")
		}
		if !seen[name] {
			seen[name] = true
			tools = append(tools, name)
		}
	}
	if len(tools) == 0 {
		return nil, fmt.Errorf("collector returned no tools")
	}
	return tools, nil
}

var toolCatalogExtension = fmt.Sprintf(`export default function (pi) {
  let hasEmittedCatalog = false;
  const emitCatalog = () => {
    if (!hasEmittedCatalog) {
      hasEmittedCatalog = true;
      console.log("%s" + JSON.stringify(pi.getAllTools().map((tool) => tool.name)));
    }
  };
  pi.registerCommand("%s", {
    description: "Emit the registered tool names",
    handler: async () => emitCatalog(),
  });
  pi.on("session_shutdown", async () => emitCatalog());
}
`, toolCatalogMarker, toolCatalogCommand)
