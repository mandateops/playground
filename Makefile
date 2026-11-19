.PHONY: install dev build check leaks hooks

# gitleaks v8.30.1, pinned by digest; CI runs the same target.
GITLEAKS_IMAGE := zricethezav/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f

install:
	bun install --frozen-lockfile --ignore-scripts

dev:
	bun run dev

build:
	bun run build

check:
	bun run typecheck
	bun run lint
	bun run format:check
	bun test

# Scans the full git history and the working tree for secrets.
leaks:
	docker run --rm -v "$(CURDIR):/repo" -w /repo $(GITLEAKS_IMAGE) git --redact --no-banner .
	docker run --rm -v "$(CURDIR):/repo" -w /repo $(GITLEAKS_IMAGE) dir --redact --no-banner --config .gitleaks.toml .

# Sets this repo's hooks, refusing to replace a hooks path you already use.
hooks:
	@current="$$(git config core.hooksPath || true)"; \
	if [ -n "$$current" ] && [ "$$current" != .githooks ]; then \
	  echo "core.hooksPath is already $$current; not changing it"; exit 1; \
	fi
	git config core.hooksPath .githooks
