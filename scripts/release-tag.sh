#!/usr/bin/env bash
# Bump electron/package.json to the given version, commit, and create an annotated
# v<VERSION> tag. Does NOT push — review locally first.
#
# Usage: scripts/release-tag.sh <x.y.z>
# Invoked by: make release-tag VERSION=<x.y.z>
set -euo pipefail

VERSION="${1:-}"
SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$'

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <x.y.z>" >&2
  exit 1
fi

if ! [[ "$VERSION" =~ $SEMVER_RE ]]; then
  echo "VERSION must be semver (e.g. 0.1.1 or 0.1.1-rc.1), got: $VERSION" >&2
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  echo "Releases must be cut from 'main' (current: $branch)." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes — commit or stash first." >&2
  exit 1
fi

if git rev-parse "v$VERSION" >/dev/null 2>&1; then
  echo "Tag v$VERSION already exists." >&2
  exit 1
fi

(cd electron && npm version "$VERSION" --no-git-tag-version)
git add electron/package.json electron/package-lock.json
git commit -m "release: v$VERSION"
git tag -a "v$VERSION" -m "Release v$VERSION"

cat <<EOF

Created commit and tag v$VERSION on main.
  Review:      git show v$VERSION
  Push:        git push <remote> main --follow-tags
  Sync to dev: git checkout dev && git cherry-pick main && git checkout main
EOF
