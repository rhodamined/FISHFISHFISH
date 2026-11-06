#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DEPLOY_TARGET:-}" ]]; then
  printf 'Set DEPLOY_TARGET to the SSH host or alias for the droplet.\n' >&2
  exit 2
fi
if [[ ! "$DEPLOY_TARGET" =~ ^[A-Za-z0-9_.@:-]+$ ]]; then
  printf 'DEPLOY_TARGET contains unsupported characters; use an SSH alias or user@host.\n' >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Commit or discard all source changes before deploying.\n' >&2
  exit 2
fi

branch="$(git branch --show-current)"
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}')"
remote_name="${upstream%%/*}"
upstream_branch="${upstream#*/}"
remote_app_dir="${REMOTE_APP_DIR:-}"
pm2_app_name="${PM2_APP_NAME:-fishfishfish}"

if [[ -z "$branch" || "$branch" != "$upstream_branch" ]]; then
  printf 'Check out a branch that tracks its upstream branch before deploying.\n' >&2
  exit 2
fi
if [[ -z "$remote_app_dir" || "$remote_app_dir" != /* || "$remote_app_dir" == *[!A-Za-z0-9_./-]* || "$remote_app_dir" == *..* ]]; then
  printf 'Set REMOTE_APP_DIR to the absolute repository path on the droplet.\n' >&2
  exit 2
fi
if [[ ! "$pm2_app_name" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  printf 'PM2_APP_NAME contains unsupported characters.\n' >&2
  exit 2
fi
if [[ ! "$remote_name" =~ ^[A-Za-z0-9_.-]+$ || ! "$branch" =~ ^[A-Za-z0-9_./-]+$ ]]; then
  printf 'The Git remote or branch name contains unsupported characters.\n' >&2
  exit 2
fi

npm test
npm run build:client

if [[ ! -s client/dist/index.html ]]; then
  printf 'Client build did not produce client/dist/index.html.\n' >&2
  exit 1
fi

git add client/dist
if ! git diff --cached --quiet -- client/dist; then
  git commit -m "Build client for deployment"
fi

git push "$remote_name" "$branch"

ssh "$DEPLOY_TARGET" "bash -s -- '$remote_app_dir' '$branch' '$pm2_app_name'" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail

app_dir="$1"
branch="$2"
pm2_app_name="$3"

cd "$app_dir"
current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$branch" ]]; then
  printf 'Remote checkout is on %s, expected %s.\n' "$current_branch" "$branch" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Remote worktree has local changes; refusing to pull over them.\n' >&2
  exit 1
fi

git pull --ff-only
npm ci --omit=dev
pm2 restart "$pm2_app_name"

attempt=0
while [[ "$attempt" -lt 20 ]]; do
  if curl --fail --silent http://127.0.0.1:3005/health >/dev/null; then
    printf 'Deployment succeeded; local health check passed.\n'
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 1
done

printf 'Health check failed. Recent PM2 logs:\n' >&2
pm2 logs "$pm2_app_name" --lines 50 --nostream >&2 || true
exit 1
REMOTE
