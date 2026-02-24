#!/usr/bin/env bash
# test-autorun.sh — Run visual tests for all prototypes sequentially
#
# Each prototype gets its own Claude session that:
#   1. Runs Playwright tests against the live dev server
#   2. Reads captured screenshots visually
#   3. Writes TEST_RESULTS_PN.md with pass/fail + visual assessment
#
# Usage:
#   bash scripts/test-autorun.sh              # Test all 5 prototypes
#   bash scripts/test-autorun.sh p1 p3        # Test specific prototypes
#   bash scripts/test-autorun.sh --dry-run    # Show what would run
#
# Prerequisites:
#   - pnpm install (including @playwright/test)
#   - npx playwright install chromium
#   - Python backend dependencies installed (uv)
#   - Prototype worktrees created at /c/Users/johnc/collage-proto-p{1..5}/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO_ROOT/test-results/logs"
SCRIPTS_DIR="$REPO_ROOT/scripts"
DRY_RUN=false
START_TIME=$(date +%s)
BACKEND_PID=""
DEV_SERVER_PID=""

# ─── Color Output ─────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Prototype Mappings ──────────────────────────────
declare -A PORTS=( [p1]=5171 [p2]=5172 [p3]=5173 [p4]=5174 [p5]=5175 )
declare -A NAMES=( [p1]="p1-sustainability" [p2]="p2-morphology" [p3]="p3-network" [p4]="p4-fragment" [p5]="p5-taxonomy" )
declare -A LABELS=( [p1]="P1 Sustainability" [p2]="P2 Morphology" [p3]="P3 Network" [p4]="P4 Fragment" [p5]="P5 Taxonomy" )
declare -A PROJECTS=( [p1]="p1-sustainability" [p2]="p2-morphology" [p3]="p3-network" [p4]="p4-fragment" [p5]="p5-taxonomy" )
ALL_PROTOS=("p5" "p2" "p1" "p3" "p4")  # P5 first (no extraction), then by complexity

# ─── Helpers ──────────────────────────────────────────

format_duration() {
    local seconds="$1"
    local minutes=$(( seconds / 60 ))
    local secs=$((seconds % 60))
    if [ "$minutes" -gt 0 ]; then
        printf "%dm %ds" "$minutes" "$secs"
    else
        printf "%ds" "$secs"
    fi
}

worktree_dir() {
    echo "$(dirname "$REPO_ROOT")/collage-proto-$1"
}

cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    [ -n "$DEV_SERVER_PID" ] && kill "$DEV_SERVER_PID" 2>/dev/null && echo "  Stopped dev server (PID $DEV_SERVER_PID)"
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null && echo "  Stopped backend (PID $BACKEND_PID)"
    DEV_SERVER_PID=""
    BACKEND_PID=""
}
trap cleanup EXIT INT TERM

# ─── Backend Management ──────────────────────────────

start_backend() {
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "  ${GREEN}Backend already running${NC}"
        return 0
    fi

    echo -e "  Starting Python backend..."
    cd "$REPO_ROOT/shared/python-backend"
    uv run uvicorn collage_backend.main:app --port 8000 > "$LOG_DIR/backend.log" 2>&1 &
    BACKEND_PID=$!

    for i in $(seq 1 60); do
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            echo -e "  ${GREEN}Backend ready (${i}s)${NC}"
            return 0
        fi
        sleep 1
    done
    echo -e "  ${RED}Backend failed to start after 60s${NC}"
    return 1
}

# ─── Dev Server Management ───────────────────────────

start_dev_server() {
    local proto="$1"
    local port="${PORTS[$proto]}"
    local worktree
    worktree="$(worktree_dir "$proto")"
    local proto_dir="$worktree/prototypes/${NAMES[$proto]}"

    if [ ! -d "$proto_dir" ]; then
        echo -e "  ${RED}Prototype directory not found: $proto_dir${NC}"
        return 1
    fi

    echo -e "  Starting dev server for ${LABELS[$proto]} on port $port..."
    cd "$proto_dir"
    npx vite --port "$port" > "$LOG_DIR/$proto-dev.log" 2>&1 &
    DEV_SERVER_PID=$!

    for i in $(seq 1 30); do
        if curl -s "http://localhost:$port" > /dev/null 2>&1; then
            echo -e "  ${GREEN}Dev server ready (${i}s)${NC}"
            return 0
        fi
        sleep 1
    done
    echo -e "  ${RED}Dev server failed to start after 30s${NC}"
    return 1
}

stop_dev_server() {
    if [ -n "$DEV_SERVER_PID" ]; then
        kill "$DEV_SERVER_PID" 2>/dev/null
        wait "$DEV_SERVER_PID" 2>/dev/null || true
        DEV_SERVER_PID=""
        sleep 2
    fi
}

# ─── Test Runner ─────────────────────────────────────

run_test() {
    local proto="$1"
    local project="${PROJECTS[$proto]}"
    local prompt_file="$SCRIPTS_DIR/test-prompt-$proto.txt"

    echo ""
    echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Testing ${LABELS[$proto]}${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"

    if [ ! -f "$prompt_file" ]; then
        echo -e "  ${RED}Prompt file not found: $prompt_file${NC}"
        return 1
    fi

    start_dev_server "$proto" || return 1

    local test_start
    test_start=$(date +%s)

    echo -e "  [$(date '+%H:%M:%S')] Launching Claude test session..."

    cd "$REPO_ROOT"
    if claude --dangerously-skip-permissions \
              --verbose \
              -p "$(cat "$prompt_file")" \
       > "$LOG_DIR/test-$proto-session.log" 2>&1; then

        local duration=$(( $(date +%s) - test_start ))
        echo -e "  [$(date '+%H:%M:%S')] ${GREEN}Test session completed${NC} in $(format_duration $duration)"
    else
        local duration=$(( $(date +%s) - test_start ))
        echo -e "  [$(date '+%H:%M:%S')] ${RED}Test session failed${NC} after $(format_duration $duration)"
    fi

    stop_dev_server

    # Check if TEST_RESULTS file was written
    if [ -f "$REPO_ROOT/test-results/TEST_RESULTS_$(echo "$proto" | tr '[:lower:]' '[:upper:]').md" ]; then
        echo -e "  ${GREEN}Results written: test-results/TEST_RESULTS_$(echo "$proto" | tr '[:lower:]' '[:upper:]').md${NC}"
    else
        echo -e "  ${YELLOW}No TEST_RESULTS file found${NC}"
    fi
}

# ─── Parse Arguments ─────────────────────────────────

PROTOS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        p[1-5]) PROTOS+=("$1"); shift ;;
        --all) PROTOS=("${ALL_PROTOS[@]}"); shift ;;
        *) echo "Usage: $0 [--all | --dry-run | p1 p2 p3 p4 p5]"; exit 1 ;;
    esac
done
[ ${#PROTOS[@]} -eq 0 ] && PROTOS=("${ALL_PROTOS[@]}")

mkdir -p "$LOG_DIR" "$REPO_ROOT/test-results/screenshots/"{p1,p2,p3,p4,p5}

# ─── Dry Run ─────────────────────────────────────────

if [ "$DRY_RUN" = true ]; then
    echo -e "${BOLD}═══════════════════════════════════════════${NC}"
    echo -e "${BOLD}  DRY RUN — ${#PROTOS[@]} prototypes${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════${NC}"
    for proto in "${PROTOS[@]}"; do
        local_dir="$(worktree_dir "$proto")/prototypes/${NAMES[$proto]}"
        echo ""
        echo -e "  ${BOLD}${LABELS[$proto]}${NC}"
        echo "     worktree:  $(worktree_dir "$proto")  $([ -d "$(worktree_dir "$proto")" ] && echo '[exists]' || echo '[MISSING]')"
        echo "     proto dir: $local_dir  $([ -d "$local_dir" ] && echo '[exists]' || echo '[MISSING]')"
        echo "     port:      ${PORTS[$proto]}"
        echo "     prompt:    $SCRIPTS_DIR/test-prompt-$proto.txt  $([ -f "$SCRIPTS_DIR/test-prompt-$proto.txt" ] && echo '[exists]' || echo '[MISSING]')"
        echo "     test file: tests/${PROJECTS[$proto]}.spec.ts  $([ -f "$REPO_ROOT/tests/${PROJECTS[$proto]}.spec.ts" ] && echo '[exists]' || echo '[MISSING]')"
    done
    echo ""
    exit 0
fi

# ─── Main ────────────────────────────────────────────

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}  Collage Earth — Visual Test Runner${NC}"
echo -e "${BOLD}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "  Prototypes: ${PROTOS[*]}"
echo -e "  Order: P5 first (no extraction), then P2→P1→P3→P4"
echo -e "  Logs: $LOG_DIR/"
echo ""

start_backend || exit 1

FAILURES=0
PASSED=0

for proto in "${PROTOS[@]}"; do
    if run_test "$proto"; then
        PASSED=$((PASSED + 1))
    else
        FAILURES=$((FAILURES + 1))
    fi
done

# ─── Final Summary ───────────────────────────────────

TOTAL_DURATION=$(( $(date +%s) - START_TIME ))
echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}  Test Results ($(format_duration $TOTAL_DURATION) total)${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "  Passed: ${GREEN}$PASSED${NC}"
echo -e "  Failed: ${RED}$FAILURES${NC}"
echo ""
echo "  Screenshots: $REPO_ROOT/test-results/screenshots/"
echo "  Results:     $REPO_ROOT/test-results/"
echo "  Logs:        $LOG_DIR/"
echo ""

exit "$FAILURES"
