#!/usr/bin/env bash
set -euo pipefail

# release-guard.sh — hard checks before creating a version tag/release.
# Usage: ./scripts/release-guard.sh vX.Y.Z

usage() {
  cat <<'EOF'
Usage: ./scripts/release-guard.sh vX.Y.Z

Validates release preconditions:
  1) tag format is vMAJOR.MINOR.PATCH
  2) hermes-fly's HERMES_FLY_VERSION matches the tag
  3) current branch is main
  4) git worktree is clean
  5) tag does not already exist locally or on origin
EOF
}

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 1
fi

tag="$1"
if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: tag must use semver format (e.g. v0.1.16): ${tag}" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
entrypoint="${repo_root}/hermes-fly"
expected="${tag#v}"

version="$(
  sed -n 's/^HERMES_FLY_VERSION="\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)"$/\1/p' \
    "$entrypoint" | head -1
)"

if [[ -z "$version" ]]; then
  echo "Error: could not parse HERMES_FLY_VERSION from ${entrypoint}" >&2
  exit 1
fi

if [[ "$version" != "$expected" ]]; then
  echo "Error: version mismatch" >&2
  echo "  Tag:               ${tag}" >&2
  echo "  Expected version:  ${expected}" >&2
  echo "  hermes-fly version:${version}" >&2
  echo "Fix: update HERMES_FLY_VERSION in hermes-fly before tagging." >&2
  exit 1
fi

current_branch="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "main" ]]; then
  echo "Error: release tags must be cut from main (current: ${current_branch})" >&2
  exit 1
fi

if ! git -C "$repo_root" diff --quiet || ! git -C "$repo_root" diff --cached --quiet; then
  echo "Error: working tree is not clean; commit or stash changes before release." >&2
  exit 1
fi

if git -C "$repo_root" rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
  echo "Error: local tag already exists: ${tag}" >&2
  exit 1
fi

if git -C "$repo_root" ls-remote --exit-code --tags origin "refs/tags/${tag}" >/dev/null 2>&1; then
  echo "Error: remote tag already exists on origin: ${tag}" >&2
  exit 1
fi

echo "Release guard passed: ${tag} (hermes-fly ${version})"
