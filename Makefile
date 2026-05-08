.PHONY: all build frontend backend clean dev-frontend dev-backend install start \
       install-electron dev-electron build-electron dist-electron dist-electron-deb dist-electron-snap \
       test test-all test-backend test-frontend test-vitest e2e e2e-install \
       test-coverage coverage-report coverage-update-allowlist

all: build

# Install all dependencies
install:
	cd backend && npm install
	cd frontend && npm install

# Build frontend and backend
build: frontend backend

frontend:
	cd frontend && npm install && npm run build

backend:
	cd backend && npm install && npm run build

# Run production build
start:
	cd backend && node dist/main.js

# Development: frontend dev server (Vite HMR, proxies /api to backend)
dev-frontend:
	cd frontend && npm run dev

# Development: backend with auto-reload
dev-backend:
	cd backend && npm run dev

# Electron
install-electron: install
	cd electron && npm install

dev-electron: frontend
	cd electron && npm run dev

build-electron: frontend
	cd electron && npm run build

dist-electron: frontend
	cd electron && npm run dist

dist-electron-deb: frontend
	cd electron && npm run dist:deb

dist-electron-snap: frontend
	cd electron && npm run dist:snap

clean:
	rm -rf backend/dist backend/node_modules frontend/dist frontend/node_modules \
	       electron/dist electron/node_modules

# Tests
test-backend:
	cd backend && npm test

test-frontend:
	cd frontend && npm test

test-vitest: test-backend test-frontend

test: test-vitest

# End-to-end tests
e2e-install:
	cd e2e && npm install && npx playwright install --with-deps chromium

e2e:
	cd e2e && npx playwright test

# Run everything: unit (backend + frontend) + e2e + REQ-ID coverage report.
# Single entry point that produces docs/test-coverage.md.
test-all: test-coverage

# Coverage
test-coverage:
	rm -rf tests/.coverage
	$(MAKE) test-backend
	$(MAKE) test-frontend
	$(MAKE) e2e
	node tests/coverage.mjs --check
	node tests/coverage.mjs --report

coverage-report:
	node tests/coverage.mjs --report

coverage-update-allowlist:
	node tests/coverage.mjs --update-allowlist
