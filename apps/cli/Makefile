APP_NAME := yishan
BUILD_DIR := bin
VERSION ?= $(shell cat VERSION 2>/dev/null || echo dev)
LDFLAGS := -s -w -X yishan/apps/cli/internal/buildinfo.Version=$(VERSION)

.PHONY: help fmt test build build-release run daemon clean release-snapshot

help:
	@printf "Common targets:\n"
	@printf "  make fmt              Format Go code\n"
	@printf "  make test             Run Go tests\n"
	@printf "  make build            Build CLI binary (dev)\n"
	@printf "  make build-release    Build optimised binary with CGO for local platform\n"
	@printf "  make run              Run CLI\n"
	@printf "  make daemon           Run daemon command\n"
	@printf "  make clean            Remove build artifacts\n"
	@printf "  make release-snapshot Run GoReleaser snapshot\n"

fmt:
	go fmt ./...

test:
	go test ./...

build:
	mkdir -p $(BUILD_DIR)
	go build -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME) .

build-release: clean
	mkdir -p $(BUILD_DIR)
	CGO_ENABLED=1 go build -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME) .

run:
	go run .

daemon:
	go run . daemon

clean:
	rm -rf $(BUILD_DIR)

release-snapshot:
	goreleaser release --snapshot --clean --config .goreleaser.yaml
