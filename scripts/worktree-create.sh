#!/usr/bin/env bash
# worktree-create.sh — Create git worktrees for prototype development
#
# Usage:
#   bash scripts/worktree-create.sh           # Create all 5 worktrees
#   bash scripts/worktree-create.sh p1 p3     # Create specific worktrees
#   bash scripts/worktree-create.sh --clean   # Remove all worktrees
#
# Each worktree is created as a sibling directory:
#   /c/Users/johnc/collage-proto-p1/
#   /c/Users/johnc/collage-proto-p2/
#   ...

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PARENT_DIR="$(dirname "$REPO_ROOT")"

ALL_PROTOS=("p1" "p2" "p3" "p4" "p5")

proto_name() {
    local id="$1"
    case "$id" in
        p1) echo "p1-sustainability" ;;
        p2) echo "p2-morphology" ;;
        p3) echo "p3-network" ;;
        p4) echo "p4-fragment" ;;
        p5) echo "p5-taxonomy" ;;
        *) echo "$id" ;;
    esac
}

proto_label() {
    local id="$1"
    case "$id" in
        p1) echo "P1 Sustainability" ;;
        p2) echo "P2 Morphology" ;;
        p3) echo "P3 Network" ;;
        p4) echo "P4 Fragment" ;;
        p5) echo "P5 Taxonomy" ;;
        *) echo "$id" ;;
    esac
}

create_worktree() {
    local id="$1"
    local name
    name=$(proto_name "$id")
    local branch="proto/$name"
    local worktree_dir="$PARENT_DIR/collage-proto-$id"

    if [ -d "$worktree_dir" ]; then
        echo "  [SKIP] $worktree_dir already exists"
        return 0
    fi

    echo "  Creating worktree for $(proto_label "$id")..."
    echo "    Branch: $branch"
    echo "    Path:   $worktree_dir"

    # Create branch from main if it doesn't exist
    if ! git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
        git -C "$REPO_ROOT" branch "$branch" main
    fi

    git -C "$REPO_ROOT" worktree add "$worktree_dir" "$branch"
    echo "  [DONE] $(proto_label "$id") worktree created"
}

remove_worktree() {
    local id="$1"
    local worktree_dir="$PARENT_DIR/collage-proto-$id"

    if [ ! -d "$worktree_dir" ]; then
        echo "  [SKIP] $worktree_dir does not exist"
        return 0
    fi

    echo "  Removing worktree: $worktree_dir"
    git -C "$REPO_ROOT" worktree remove "$worktree_dir" --force 2>/dev/null || true
    echo "  [DONE] Removed"
}

# Parse arguments
CLEAN=false
PROTOS=()

while [ $# -gt 0 ]; do
    case "$1" in
        --clean)
            CLEAN=true
            PROTOS=("${ALL_PROTOS[@]}")
            shift
            ;;
        p[1-5])
            PROTOS+=("$1")
            shift
            ;;
        *)
            echo "[ERROR] Unknown argument: $1"
            echo "Usage: $0 [--clean | p1 p2 p3 p4 p5]"
            exit 1
            ;;
    esac
done

if [ ${#PROTOS[@]} -eq 0 ]; then
    PROTOS=("${ALL_PROTOS[@]}")
fi

echo "═══════════════════════════════════════════"
if [ "$CLEAN" = true ]; then
    echo "  Removing prototype worktrees"
else
    echo "  Creating prototype worktrees"
fi
echo "═══════════════════════════════════════════"
echo ""

for id in "${PROTOS[@]}"; do
    if [ "$CLEAN" = true ]; then
        remove_worktree "$id"
    else
        create_worktree "$id"
    fi
done

echo ""
echo "═══════════════════════════════════════════"
echo "  Done."
echo "═══════════════════════════════════════════"
