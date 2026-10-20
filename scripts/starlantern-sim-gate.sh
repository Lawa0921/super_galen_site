#!/usr/bin/env bash
# 星燈迷宮 sim gate (plan 8a Task 1): runs the balance suites with the per-round action trace and the balance report on,
# then compares the sorted report lines and the action hashes with a fixture directory, byte for byte.
#
#   bash scripts/starlantern-sim-gate.sh <out-dir> [<against-dir>]
#
# <against-dir> defaults to the old-roster fixtures. The full vitest output goes to <out-dir>.log (outside the directory).
# Exit 0 and a last line "gate: identical" only when every file matches and every test passed.
set -u

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "usage: $0 <out-dir> [<against-dir>]" >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" || exit 2

engine="src/scripts/games/starlantern/engine"
out="${1%/}"
against="${2:-$engine/__fixtures__/sim-gate}"
against="${against%/}"
log="$out.log"

mkdir -p "$out" || exit 2
out_abs="$(cd "$out" && pwd)"
# Only the files this script writes; nothing else in the directory is touched.
rm -f "$out/report.txt" "$out/balance.actions.json" "$out/lineups.actions.json" "$out/deep.actions.json" "$out/contribution.json"

files=("$engine/balance.test.ts" "$engine/balance.lineups.test.ts" "$engine/balance.deep.test.ts" "$engine/balance.pace.test.ts")
if [ -f "$engine/parity.test.ts" ]; then files+=("$engine/parity.test.ts"); fi

SIM_GATE_OUT="$out_abs" BALANCE_REPORT=1 npx vitest run "${files[@]}" --testTimeout=300000 > "$log" 2>&1
status=$?

tr -d '\r' < "$log" | grep -aE '^\[(balance|lineups|deep|pace)\] ' | LC_ALL=C sort > "$out/report.txt"

# The vitest summary, without colours.
sed -e 's/\x1b\[[0-9;]*m//g' "$log" | grep -aE '^ *(Test Files|Tests) ' || echo "(no vitest summary; see $log)"

if [ "$status" -ne 0 ]; then
  echo "gate: vitest failed (exit $status); see $log"
  exit 1
fi

if git diff --no-index --exit-code -- "$against" "$out"; then
  echo "gate: identical"
  exit 0
fi
echo "gate: DIFFERENT from $against"
exit 1
