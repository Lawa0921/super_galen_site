#!/usr/bin/env bash
# Serial post-build chain for a roster-expansion unit (one heavy step at a time).
# Usage (worktree root): bash art-factory/rts/tools/roster_qa_chain.sh <unit> <run> <weapon-prefix> [release-json]
set -euo pipefail
UNIT=$1; RUN=$2; WEAPON=$3; RELEASE=${4:-'{}'}
BLENDER=${BLENDER:-"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"}
T=art-factory/rts/tools
export RTS_POSE_RUN=$RUN
rm -f "$RUN"/raw/*.blend1
python $T/roster_pack.py --run "$RUN" --unit "$UNIT"
node $T/roster_validate.mjs "$RUN" "$UNIT"
node $T/all_models_runtime_pose.mjs "$UNIT" 31 >/dev/null
"$BLENDER" --background --factory-startup --python-exit-code 1 --python $T/all_models_runtime_collision.py -- "$UNIT" | grep -E '^\{"unit' | cut -c1-200
"$BLENDER" --background --factory-startup --python-exit-code 1 --python $T/roster_hand_qa.py -- "$RUN" "$UNIT" "$WEAPON" "$RELEASE" | grep -E '^\{' | cut -c1-300
mkdir -p "$RUN/qa/dense"
cp "$RUN/qa/$UNIT-runtime-poses.json" "$RUN/qa/dense/collision-poses-31.json"
node $T/all_models_runtime_pose.mjs "$UNIT" 145 >/dev/null
python $T/roster_bounds_check.py --run "$RUN" --unit "$UNIT"
mv "$RUN/qa/$UNIT-runtime-poses.json" "$RUN/qa/dense/$UNIT-runtime-poses-145.json"
mv "$RUN/qa/dense/collision-poses-31.json" "$RUN/qa/$UNIT-runtime-poses.json"
python $T/roster_integrity.py --run "$RUN" --unit "$UNIT" --clips "${CLIPS:-Idle,Walk,Attack,Hurt,Death}"
python $T/roster_publish.py --run "$RUN" --unit "$UNIT"
