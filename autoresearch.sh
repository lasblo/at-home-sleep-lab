#!/usr/bin/env bash
set -euo pipefail

# Autoresearch: Iterative movement detection optimization via Claude Code
# Usage: ./autoresearch.sh [max_iterations]

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

MAX_ITERATIONS=${1:-20}
LOG_FILE="ITERATIONS.md"
BRANCH="autoresearch/optimize-pipeline"
EVAL_CMD="docker compose -f compose.dev.yml exec -T backend python evaluate.py"
TIMEOUT_SEC=600

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[autoresearch]${NC} $*" >&2; }
warn() { echo -e "${YELLOW}[autoresearch]${NC} $*" >&2; }
err() { echo -e "${RED}[autoresearch]${NC} $*" >&2; }

# --- Ensure dev stack is running ---
log "Starting dev stack (db + backend)..."
docker compose -f compose.dev.yml up -d db backend
# Wait for backend to be ready
for i in $(seq 1 30); do
    if docker compose -f compose.dev.yml exec -T backend python -c "import asyncpg" 2>/dev/null; then
        break
    fi
    sleep 2
done

# --- Create/checkout optimization branch ---
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
        log "Checking out existing branch: $BRANCH"
        git checkout "$BRANCH"
    else
        log "Creating new branch: $BRANCH"
        git checkout -b "$BRANCH"
    fi
fi

# --- Helper: extract F1 from evaluate.py JSON output ---
get_f1() {
    local output
    output=$($EVAL_CMD 2>/dev/null)
    if echo "$output" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['f1'])" 2>/dev/null; then
        return 0
    else
        err "Failed to parse evaluation output: $output"
        return 1
    fi
}

# --- Establish baseline ---
log "Running baseline evaluation..."
BASELINE_F1=$(get_f1)
BEST_F1="$BASELINE_F1"
log "Baseline F1: $BASELINE_F1"

# --- Initialize log file ---
if [ ! -f "$LOG_FILE" ]; then
    cat > "$LOG_FILE" << EOF
# Autoresearch Iteration Log

**Target:** Optimize movement detection in \`backend/pipeline.py\`
**Baseline F1:** ${BASELINE_F1}
**Started:** $(date -Iseconds)
**Loss function:** 1 - F1 (temporal IoU matching with classification penalty)

---

EOF
    git add "$LOG_FILE"
    git commit -m "autoresearch: initialize iteration log (baseline F1=${BASELINE_F1})"
fi

# --- Cleanup on exit ---
cleanup() {
    log "Autoresearch stopped after $((i - 1)) iterations."
    log "Baseline F1: $BASELINE_F1 → Best F1: $BEST_F1"
    if [ "$BEST_F1" != "$BASELINE_F1" ]; then
        IMPROVEMENT=$(python3 -c "print(f'{(($BEST_F1 - $BASELINE_F1) / max($BASELINE_F1, 0.0001)) * 100:+.1f}%')")
        log "Total improvement: $IMPROVEMENT"
    fi
}
trap cleanup EXIT
i=1

# --- Main loop ---
for i in $(seq 1 "$MAX_ITERATIONS"); do
    log "=== Iteration $i / $MAX_ITERATIONS ==="

    # Read current state for prompt injection
    ITERATIONS_CONTENT=$(cat "$LOG_FILE")
    PIPELINE_CONTENT=$(cat backend/pipeline.py)

    # Build the Claude prompt
    PROMPT=$(cat << PROMPT_EOF
You are optimizing the movement detection algorithm in backend/pipeline.py for a sleep analysis system.

## Strict Rules
1. Read backend/pipeline.py first, then make exactly ONE targeted change.
2. Do NOT modify any other Python files (not plms.py, not evaluate.py, not db.py).
3. After your change, run the evaluation:
   docker compose -f compose.dev.yml exec -T backend python evaluate.py
4. Parse the JSON output to get the new F1 score.
5. The previous best F1 is: ${BEST_F1} (original baseline: ${BASELINE_F1})
6. If new F1 > ${BEST_F1}: run these commands:
   git add backend/pipeline.py
   git commit -m "autoresearch(iter ${i}): <brief description> (F1: ${BEST_F1} -> <new_f1>)"
7. If new F1 <= ${BEST_F1}: revert with:
   git checkout backend/pipeline.py
8. Then append your iteration entry to ITERATIONS.md (format below) and commit the log:
   git add ITERATIONS.md
   git commit -m "autoresearch: log iteration ${i}"
9. Then stop — do not make additional changes.

## Previous Iterations (learn from these!)
${ITERATIONS_CONTENT}

## Iteration Log Entry Format
Append exactly this to the end of ITERATIONS.md:

### Iteration ${i}
- **Change:** <one-line description of what you changed>
- **Hypothesis:** <why this might improve detection>
- **Result:** F1 <old> -> <new> (<+/-X.X%>) [KEPT|REVERTED]
- **Commit:** <hash or "reverted">

## Strategy Guidance
Areas to explore:
- Tune constants (FRAME_SKIP, GAUSSIAN_KERNEL, ROI_Y_FRACTION, GRID dimensions, SMOOTH_WINDOW, BASELINE_WINDOW_SEC, MIN_SPATIAL_VARIANCE, PEAK_PROMINENCE, MIN_PEAK_DISTANCE_SEC)
- Signal processing improvements (different smoothing methods, better baseline estimation)
- Better onset/offset detection (the 15% amplitude crossing threshold)
- Spatial variance weighting formula (the sv_weight = max(0, sv - 0.3) line)
- Grid analysis improvements (weighted cells, adaptive grid)
- Noise reduction techniques
- Do NOT repeat approaches that already failed unless with a meaningfully different parameter value.
- If a direction worsened the score, try the opposite direction.
- Consider that the ground truth labels have categories: leg, arm, body. The detector classifies as limb or body. Classification accuracy matters.
PROMPT_EOF
    )

    # Run Claude Code session
    log "Launching Claude Code session..."
    set +e
    timeout "$TIMEOUT_SEC" claude -p "$PROMPT" \
        --max-turns 50 \
        --dangerously-skip-permissions \
        2>&1 | tee "/tmp/autoresearch_iter_${i}.log"
    CLAUDE_EXIT=$?
    set -e

    if [ "$CLAUDE_EXIT" -eq 124 ]; then
        warn "Iteration $i timed out after ${TIMEOUT_SEC}s"
        git checkout backend/pipeline.py 2>/dev/null || true
    elif [ "$CLAUDE_EXIT" -ne 0 ]; then
        warn "Iteration $i exited with code $CLAUDE_EXIT"
    fi

    # Safety: revert if unexpected files were modified
    UNEXPECTED=$(git diff --name-only | grep -v 'backend/pipeline.py' | grep -v 'ITERATIONS.md' || true)
    if [ -n "$UNEXPECTED" ]; then
        warn "Unexpected modified files detected, reverting: $UNEXPECTED"
        echo "$UNEXPECTED" | xargs git checkout --
    fi

    # Verify current score independently
    set +e
    CURRENT_F1=$(get_f1)
    set -e
    if [ -n "$CURRENT_F1" ]; then
        BEST_F1="$CURRENT_F1"
        log "Verified F1 after iteration $i: $CURRENT_F1"
    else
        warn "Could not verify F1 after iteration $i"
    fi

    log "Iteration $i complete. Best F1: $BEST_F1"
    echo ""
done
