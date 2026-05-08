.PHONY: all build frontend backend clean dev-frontend dev-backend install start \
       install-electron dev-electron build-electron dist-electron dist-electron-deb dist-electron-snap \
       test test-all test-backend test-frontend test-vitest e2e e2e-install \
       test-coverage coverage-report coverage-update-allowlist \
       release-tag

# Default target: full production build (frontend + backend).
all: build

# ---------------------------------------------------------------------------
# Install & build
# ---------------------------------------------------------------------------

# Install backend and frontend dependencies (does not touch electron/).
install:
	cd backend && npm install
	cd frontend && npm install

# Full production build: frontend bundle + backend dist.
build: frontend backend

# Build frontend: install deps then `vue-tsc -b && vite build` -> frontend/dist.
frontend:
	cd frontend && npm install && npm run build

# Build backend: install deps then `tsc` -> backend/dist.
backend:
	cd backend && npm install && npm run build

# Run the production server: node backend/dist/main.js (PORT, HOST, ALLOWED_ROOTS env vars apply).
start:
	cd backend && node dist/main.js

# ---------------------------------------------------------------------------
# Development (run dev-backend and dev-frontend simultaneously in two shells)
# ---------------------------------------------------------------------------

# Frontend dev server: Vite HMR on :5173, proxies /api and /ws/* to backend.
dev-frontend:
	cd frontend && npm run dev

# Backend dev server: `tsx watch` auto-reload on :8080.
dev-backend:
	cd backend && npm run dev

# ---------------------------------------------------------------------------
# Electron (desktop wrapper around the built frontend)
# ---------------------------------------------------------------------------

# Install backend + frontend deps, then electron deps.
install-electron: install
	cd electron && npm install

# Build frontend, then run the Electron dev shell pointing at it.
dev-electron: frontend
	cd electron && npm run dev

# Build frontend, then build the Electron app (no packaging).
build-electron: frontend
	cd electron && npm run build

# Package the Electron app as a Linux AppImage.
dist-electron: frontend
	cd electron && npm run dist

# Package the Electron app as a .deb.
dist-electron-deb: frontend
	cd electron && npm run dist:deb

# Package the Electron app as a Snap.
dist-electron-snap: frontend
	cd electron && npm run dist:snap

# Remove dist/ and node_modules/ from backend, frontend, and electron.
clean:
	rm -rf backend/dist backend/node_modules frontend/dist frontend/node_modules \
	       electron/dist electron/node_modules

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

# Run backend Vitest unit tests.
test-backend:
	cd backend && npm test

# Run frontend Vitest unit tests.
test-frontend:
	cd frontend && npm test

# Run all Vitest unit tests (backend + frontend). Fast inner-loop suite.
test-vitest: test-backend test-frontend

# Default test target: alias for test-vitest (unit tests only, no e2e).
test: test-vitest

# One-time setup for end-to-end tests: install e2e deps and Playwright + chromium.
e2e-install:
	cd e2e && npm install && npx playwright install --with-deps chromium

# Run the Playwright end-to-end suite.
e2e:
	cd e2e && npx playwright test

# Single entry point: run every test suite and produce one REQ-ID coverage report.
# Use this before pushing or when you want a unified docs/test-coverage.md.
test-all: test-coverage

# ---------------------------------------------------------------------------
# Coverage (REQ-ID traceability vs docs/requirements/)
# ---------------------------------------------------------------------------

# Wipe prior coverage data, run all suites (backend + frontend + e2e), then
# verify every REQ-ID is covered (or allowlisted) and write docs/test-coverage.md.
test-coverage:
	rm -rf tests/.coverage
	$(MAKE) test-backend
	$(MAKE) test-frontend
	$(MAKE) e2e
	node tests/coverage.mjs --check
	node tests/coverage.mjs --report

# Regenerate docs/test-coverage.md from existing tests/.coverage/ data (no rerun).
coverage-report:
	node tests/coverage.mjs --report

# Prune tests/uncovered-allowlist.txt: drop IDs that are now actually covered.
coverage-update-allowlist:
	node tests/coverage.mjs --update-allowlist

# ---------------------------------------------------------------------------
# Release
# ---------------------------------------------------------------------------

# Bump electron/package.json to VERSION, commit, and create an annotated
# v<VERSION> tag. See scripts/release-tag.sh for the actual logic.
#
# Usage: make release-tag VERSION=0.1.1
release-tag:
	@scripts/release-tag.sh "$(VERSION)"
