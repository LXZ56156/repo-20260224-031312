#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
HOOK_PATH="$PROJECT_ROOT/.git/hooks/post-commit"
HOOK_SOURCE="$PROJECT_ROOT/scripts/git-hooks/post-commit-cloud-deploy.sh"
MARKER="badminton-miniapp cloud post-commit deploy hook"
FORCE=false

print_help() {
  cat <<'EOF'
Usage:
  bash scripts/install-cloud-deploy-hook.sh
  bash scripts/install-cloud-deploy-hook.sh --force

Options:
  --force   Replace an existing non-managed post-commit hook after backing it up.
  --help    Show this help message.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$HOOK_SOURCE" ]; then
  echo "ERROR: Missing hook source: $HOOK_SOURCE" >&2
  exit 1
fi

if [ -f "$HOOK_PATH" ] && ! grep -q "$MARKER" "$HOOK_PATH"; then
  if [ "$FORCE" != true ]; then
    echo "ERROR: Existing post-commit hook is not managed by this project: $HOOK_PATH" >&2
    echo "Re-run with --force to back it up and replace it." >&2
    exit 1
  fi

  BACKUP_PATH="$HOOK_PATH.backup.$(date +%Y%m%d%H%M%S)"
  cp "$HOOK_PATH" "$BACKUP_PATH"
  echo "Backed up existing post-commit hook to: $BACKUP_PATH"
fi

cat > "$HOOK_PATH" <<EOF
#!/usr/bin/env bash
# $MARKER
exec bash "\$(git rev-parse --show-toplevel)/scripts/git-hooks/post-commit-cloud-deploy.sh" "\$@"
EOF

chmod +x "$HOOK_PATH"
chmod +x "$HOOK_SOURCE"

echo "Installed post-commit cloud deploy hook: $HOOK_PATH"
