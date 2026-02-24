#!/usr/bin/env bash
# proto-autorun.sh — Launch and manage parallel prototype build sessions
#
# Each prototype retries until its FINDINGS.md contains "Status: Complete".
#
# Usage:
#   bash scripts/proto-autorun.sh p1           # Run one prototype
#   bash scripts/proto-autorun.sh p1 p2 p3     # Run specific prototypes
#   bash scripts/proto-autorun.sh --all        # Run all 5 prototypes
#   bash scripts/proto-autorun.sh --dry-run    # Show what would run
#
# Prerequisites:
#   - Worktrees created via scripts/worktree-create.sh
#   - Prompt files in scripts/proto-prompt-p1.txt through p5.txt
#
# Logs go to logs/proto-<id>-session-<N>.log

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
SCRIPTS_DIR="$REPO_ROOT/scripts"
PAUSE_BETWEEN_RETRIES=30
DRY_RUN=false
START_TIME=$(date +%s)

# ─── Color Output ─────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Prototype Name Mappings ─────────────────────────

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
        p1) echo "P1 Sustainability Scanner" ;;
        p2) echo "P2 Morpho-Metrics Scanner" ;;
        p3) echo "P3 Network Analysis" ;;
        p4) echo "P4 Fragment Workflow" ;;
        p5) echo "P5 Urban Taxonomy" ;;
        *) echo "$id" ;;
    esac
}

ALL_PROTOS=("p1" "p2" "p3" "p4" "p5")

# ─── Helper Functions ─────────────────────────────────

proto_dir() {
    local id="$1"
    echo "$(dirname "$REPO_ROOT")/collage-proto-$id"
}

is_proto_complete() {
    local id="$1"
    local findings
    findings="$(proto_dir "$id")/prototypes/$(proto_name "$id")/FINDINGS.md"
    [ -f "$findings" ] && grep -qi "Status:.*Complete" "$findings"
}

format_duration() {
    local seconds="$1"
    local hours=$((seconds / 3600))
    local minutes=$(( (seconds % 3600) / 60 ))
    local secs=$((seconds % 60))
    if [ "$hours" -gt 0 ]; then
        printf "%dh %dm %ds" "$hours" "$minutes" "$secs"
    elif [ "$minutes" -gt 0 ]; then
        printf "%dm %ds" "$minutes" "$secs"
    else
        printf "%ds" "$secs"
    fi
}

show_log_tail() {
    local log_file="$1"
    local lines="${2:-5}"
    if [ -f "$log_file" ]; then
        echo -e "  ${YELLOW}Last $lines log lines:${NC}"
        tail -n "$lines" "$log_file" | sed 's/^/    /'
    fi
}

# ─── Progress Summary ────────────────────────────────

print_progress() {
    local running=("$@")
    local elapsed=$(( $(date +%s) - START_TIME ))

    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Progress Summary  ($(format_duration $elapsed) elapsed)${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════${NC}"

    for id in "${ALL_PROTOS[@]}"; do
        local label
        label=$(proto_label "$id")
        if is_proto_complete "$id" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} $label — ${GREEN}complete${NC}"
        elif printf '%s\n' "${running[@]}" | grep -q "^${id}$" 2>/dev/null; then
            echo -e "  ${BLUE}⟳${NC} $label — ${BLUE}running${NC}"
        else
            echo -e "  ${YELLOW}·${NC} $label — pending"
        fi
    done

    echo -e "${BOLD}═══════════════════════════════════════════${NC}"
    echo ""
}

# ─── Run a Single Prototype ──────────────────────────

run_proto() {
    local id="$1"
    local worktree
    worktree="$(proto_dir "$id")"
    local prompt_file="$SCRIPTS_DIR/proto-prompt-$id.txt"
    local session=0
    local label
    label=$(proto_label "$id")

    if [ ! -d "$worktree" ]; then
        echo -e "${RED}[ERROR]${NC} Worktree not found: $worktree"
        echo "  Run: bash scripts/worktree-create.sh $(proto_name "$id")"
        return 1
    fi

    if [ ! -f "$prompt_file" ]; then
        echo -e "${RED}[ERROR]${NC} Prompt file not found: $prompt_file"
        return 1
    fi

    local findings="$worktree/prototypes/$(proto_name "$id")/FINDINGS.md"

    while true; do
        if [ -f "$findings" ] && grep -qi "Status:.*Complete" "$findings"; then
            echo -e "[$(date '+%H:%M:%S')] ${GREEN}${BOLD}$label${NC} — already complete."
            return 0
        fi

        session=$((session + 1))
        local log_file="$LOG_DIR/proto-${id}-session-${session}.log"
        local session_start
        session_start=$(date +%s)

        echo ""
        echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
        echo -e "${BOLD}║  $label — Session $session${NC}"
        echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
        echo -e "  [$(date '+%H:%M:%S')] Starting..."

        if cd "$worktree" && \
           claude --dangerously-skip-permissions \
                  --verbose \
                  -p "$(cat "$prompt_file")" \
           > "$log_file" 2>&1; then

            local session_end
            session_end=$(date +%s)
            local duration=$(( session_end - session_start ))
            echo -e "  [$(date '+%H:%M:%S')] ${GREEN}Session $session completed${NC} in $(format_duration $duration)"
        else
            local session_end
            session_end=$(date +%s)
            local duration=$(( session_end - session_start ))
            echo -e "  [$(date '+%H:%M:%S')] ${RED}Session $session failed${NC} after $(format_duration $duration)"
            show_log_tail "$log_file" 5
        fi

        if [ -f "$findings" ] && grep -qi "Status:.*Complete" "$findings"; then
            local total_end
            total_end=$(date +%s)
            local total_duration=$(( total_end - START_TIME ))
            echo -e "  [$(date '+%H:%M:%S')] ${GREEN}${BOLD}$label — COMPLETE${NC} after $session session(s)"
            return 0
        fi

        echo -e "  [$(date '+%H:%M:%S')] ${YELLOW}Not yet complete. Retrying in ${PAUSE_BETWEEN_RETRIES}s...${NC}"
        sleep "$PAUSE_BETWEEN_RETRIES"
    done
}

# ─── Parse Arguments ──────────────────────────────────

MODE=""
PROTOS=()

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --all)
            MODE="all"
            PROTOS=("${ALL_PROTOS[@]}")
            shift
            ;;
        p[1-5])
            MODE="named"
            PROTOS+=("$1")
            shift
            ;;
        *)
            echo -e "${RED}[ERROR]${NC} Unknown argument: $1"
            echo "Usage: $0 [--all | --dry-run | p1 p2 p3 p4 p5]"
            exit 1
            ;;
    esac
done

if [ ${#PROTOS[@]} -eq 0 ]; then
    echo "Usage: $0 [--all | --dry-run | p1 p2 p3 p4 p5]"
    exit 1
fi

mkdir -p "$LOG_DIR"

# ─── Dry Run ─────────────────────────────────────────

if [ "$DRY_RUN" = true ]; then
    echo -e "${BOLD}═══════════════════════════════════════════${NC}"
    echo -e "${BOLD}  DRY RUN — ${#PROTOS[@]} prototypes${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════${NC}"
    for id in "${PROTOS[@]}"; do
        local_name="$(proto_name "$id")"
        local_label="$(proto_label "$id")"
        local_dir="$(proto_dir "$id")"
        local_prompt="$SCRIPTS_DIR/proto-prompt-$id.txt"
        local_status="pending"
        if is_proto_complete "$id" 2>/dev/null; then
            local_status="COMPLETE"
        fi
        echo ""
        echo -e "  ${BOLD}$local_label${NC}"
        echo "     worktree: $local_dir  $([ -d "$local_dir" ] && echo '[exists]' || echo '[MISSING]')"
        echo "     prompt:   $local_prompt  $([ -f "$local_prompt" ] && echo '[exists]' || echo '[MISSING]')"
        echo "     status:   $local_status"
    done
    echo ""
    exit 0
fi

# ─── Main: Run Prototypes ────────────────────────────

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}  Collage Earth — Prototype Autorun${NC}"
echo -e "${BOLD}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "  Prototypes: ${PROTOS[*]}"
echo -e "  Logs: $LOG_DIR/"
echo -e "  Stop: Ctrl+C (or kill PID $$)"
echo ""

# Check which prototypes still need to run
TO_RUN=()
ALREADY_DONE=()
for id in "${PROTOS[@]}"; do
    if is_proto_complete "$id" 2>/dev/null; then
        ALREADY_DONE+=("$id")
    else
        TO_RUN+=("$id")
    fi
done

if [ ${#ALREADY_DONE[@]} -gt 0 ]; then
    echo -e "  ${GREEN}Already complete:${NC} ${ALREADY_DONE[*]}"
fi

if [ ${#TO_RUN[@]} -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}All prototypes already complete!${NC}"
    exit 0
fi

echo -e "  ${BLUE}Launching:${NC} ${TO_RUN[*]}"
echo ""

# Launch prototypes in parallel
PIDS=()
PROTO_IDS=()
for id in "${TO_RUN[@]}"; do
    run_proto "$id" &
    PIDS+=($!)
    PROTO_IDS+=("$id")
    echo -e "  $(proto_label "$id") started (PID ${PIDS[-1]})"
    sleep 5  # Stagger starts
done

echo ""
echo "Waiting for all prototypes to complete..."
echo "  Monitor: tail -f $LOG_DIR/proto-*-session-*.log"
echo ""

# Periodic progress updates
(
    while true; do
        sleep 300  # Every 5 minutes
        print_progress "${PROTO_IDS[@]}"
    done
) &
PROGRESS_PID=$!
trap "kill $PROGRESS_PID 2>/dev/null; exit" EXIT INT TERM

# Wait for all
FAILURES=0
for i in "${!PIDS[@]}"; do
    if wait "${PIDS[$i]}"; then
        echo -e "[$(date '+%H:%M:%S')] ${GREEN}[DONE]${NC} $(proto_label "${PROTO_IDS[$i]}")"
    else
        echo -e "[$(date '+%H:%M:%S')] ${RED}[FAIL]${NC} $(proto_label "${PROTO_IDS[$i]}")"
        FAILURES=$((FAILURES + 1))
    fi
done

kill $PROGRESS_PID 2>/dev/null || true

# Final summary
TOTAL_DURATION=$(( $(date +%s) - START_TIME ))
echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}  Final Results  ($(format_duration $TOTAL_DURATION) total)${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
print_progress "${PROTO_IDS[@]}"

if [ "$FAILURES" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}All prototypes completed successfully.${NC}"
else
    echo -e "${RED}${BOLD}$FAILURES prototype(s) failed. Check logs.${NC}"
fi
echo ""

exit "$FAILURES"
