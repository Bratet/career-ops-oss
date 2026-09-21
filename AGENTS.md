# Repository Guidelines

## Project Structure & Module Organization

This is a localhost-only Next.js application for managing job applications and tailoring CVs. Route pages and API handlers live under `src/app/`; reusable React components are in `src/components/`. Core TypeScript logic belongs in `src/lib/`, with LLM adapters under `src/lib/engine/` and tailoring logic under `src/lib/tailoring/`. Operational scripts and tests live in `scripts/`. `templates/` contains RenderCV inputs.

Everything the app reads or writes lives under `workspace/`, grouped by role: `workspace/resumes/masters/` and `workspace/resumes/own/` hold the hand-maintained source YAML files, each paired with its own rendered PDF; `workspace/applications/` holds one folder per tailored application, entirely reproducible from `workspace/resumes/`; `workspace/state/` is the app's operational database — treat `workspace/state/applications.md` as the application database and `workspace/state/app-index.json` as its folder index.

## Build, Test, and Development Commands

- `make setup`: install npm dependencies and reconcile legacy application folders.
- `make engines`: verify that Claude, Codex, and RenderCV CLIs are available.
- `make dev PORT=3000`: start the local development server.
- `make check`: run strict TypeScript checking without emitting files.
- `make test`: run tracker round-trip, operation, and tailoring tests.
- `make build`: create a production build; do not run it beside `make dev` because both use `.next/`.
- `make reconcile`: rebuild `workspace/state/app-index.json` from application folder names.

Run `make check && make test` before submitting changes.

## Coding Style & Naming Conventions

Use strict TypeScript and two-space indentation, matching existing files. Prefer named exports, focused modules, and the `@/` alias for imports from `src/`. React components use PascalCase filenames (`TailorPanel.tsx`); utilities use camelCase (`renderStore.ts`). Next.js routes follow framework conventions such as `page.tsx` and `route.ts`. Centralize repository paths in `src/lib/paths.ts`; do not construct competing paths elsewhere. Preserve the established semicolon-free style.

## Testing Guidelines

Tests are executable scripts rather than a separate framework suite. Name new tests `scripts/test-<area>.ts` or `.mjs`, add the corresponding npm script, and include it in `make test`. Always run tracker tests after changing `src/lib/tracker.ts`; serialization must leave `workspace/state/applications.md` byte-identical. Cover valid behavior, rejected inputs, and file-format invariants.

## Commit & Pull Request Guidelines

History follows Conventional Commit-style subjects such as `feat(tailoring): rank requirements` and `chore(make): add launch targets`. Use an imperative, scoped summary and keep each commit focused. Pull requests should explain user-visible behavior, list verification commands, link relevant issues, and include screenshots for UI changes. Call out changes to tracked data, resume sources, templates, or generated output explicitly.

## Security & Configuration

Keep the app local: route handlers spawn authenticated CLIs and access repository files. Never commit API keys, CLI credentials, or machine-specific settings. Preserve atomic writes and validation around tracked data.
