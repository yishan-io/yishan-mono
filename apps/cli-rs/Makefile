APP_NAME := yishan
VERSION  ?= dev
BIN_DIR  := bin

# Cross-compilation targets (matches GoReleaser matrix in release.yml)
TARGETS := \
	darwin/arm64 \
	darwin/amd64 \
	linux/amd64 \
	linux/arm64 \
	windows/amd64 \
	windows/arm64

.PHONY: build build-release clean test vet fmt check

## build — debug build for local development (output: bin/yishan)
build:
	mkdir -p $(BIN_DIR)
	cargo build
	cp target/debug/$(APP_NAME) $(BIN_DIR)/$(APP_NAME)

## build-release — optimised release build (output: bin/yishan)
build-release:
	mkdir -p $(BIN_DIR)
	cargo build --release \
		--config "env.YISHAN_VERSION=\"$(VERSION)\""
	cp target/release/$(APP_NAME) $(BIN_DIR)/$(APP_NAME)
	@echo "Built $(BIN_DIR)/$(APP_NAME) ($(VERSION))"

## clean — remove build artefacts
clean:
	cargo clean
	rm -rf $(BIN_DIR)

## test — run unit tests
test:
	cargo test

## vet — static analysis
vet:
	cargo clippy -- -D warnings

## fmt — format source
fmt:
	cargo fmt

## check — typecheck without codegen
check:
	cargo check
