# career-ops — local app
#
# `make` on its own prints this list.
# Everything runs on localhost; nothing here deploys anywhere.

.DEFAULT_GOAL := help
.PHONY: help setup dev build start stop check test reconcile engines clean nuke

PORT ?= 3000

help: ## Show this help
	@echo "career-ops — make targets"
	@echo
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "  PORT=$(PORT)  (override: make dev PORT=4000)"

setup: node_modules ## Install dependencies and link legacy output folders
	@npm run reconcile

node_modules: package.json package-lock.json
	@npm install
	@touch node_modules

dev: node_modules ## Run the app in dev mode
	@echo "→ http://localhost:$(PORT)"
	@npm run dev -- --port $(PORT)

build: node_modules ## Production build
	@npm run build

start: node_modules ## Serve the production build
	@echo "→ http://localhost:$(PORT)"
	@npm start -- --port $(PORT)

stop: ## Free the port
	@lsof -ti tcp:$(PORT) | while read -r pid; do kill $$pid 2>/dev/null || true; done
	@echo "port $(PORT) clear"

check: node_modules ## Typecheck
	@npx tsc --noEmit && echo "types ok"

test: node_modules ## Tracker and tailoring tests
	@npm run test:general-application
	@npm run test:tracker
	@npm run test:ops
	@npm run test:tailoring
	@npm run test:skills
	@npm run test:runs
	@npm run test:editor-chat
	@npm run test:engine-settings
	@npm run test:application-delete
	@npm run test:workspaces
	@npm run test:application-flow

reconcile: node_modules ## Rebuild workspace/state/app-index.json from folder names
	@npm run reconcile

engines: ## Report whether the Claude and Codex CLIs are available
	@printf 'claude  '; claude --version 2>/dev/null || echo "not found — install Claude Code and run 'claude login'"
	@printf 'codex   '; codex --version 2>/dev/null || echo "not found — install codex and run 'codex login'"
	@printf 'rendercv '; rendercv --version 2>/dev/null || python3 -m rendercv --version 2>/dev/null || echo "not found — pip install 'rendercv>=2.8'"

clean: ## Remove build output
	@rm -rf .next
	@rm -rf rendercv_output
	@echo "cleaned"

nuke: clean ## clean + drop node_modules
	@rm -rf node_modules
	@echo "node_modules removed — 'make setup' to reinstall"

claude :
	- claude --dangerously-skip-permissions

codex:
	- codex --dangerously-bypass-approvals-and-sandbox
