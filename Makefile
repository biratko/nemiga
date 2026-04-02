.PHONY: all build frontend backend clean dev-frontend dev-backend install start \
       install-electron dev-electron build-electron dist-electron dist-electron-deb dist-electron-snap

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
