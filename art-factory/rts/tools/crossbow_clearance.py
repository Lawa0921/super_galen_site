"""Pure selection policy for the crossbow's collision-aware elbow solve."""

from __future__ import annotations


def choose_clearance_candidate(candidates, safety_clearance_m=0.006):
    """Choose the safest reachable elbow candidate deterministically.

    Candidates are mappings with ``crossings`` (integer), ``clearance_m``
    (minimum distance to the relevant weapon part), and ``continuity_m``
    (distance from the previous frame's elbow).  Exact crossings dominate;
    Once the minimum crossing count is known, candidates with a sufficient
    geometric gap prefer continuity so the elbow does not jump between circle
    samples.  If every candidate is too close to the weapon, clearance remains
    the first tie-breaker and continuity is used as the final stabilizer.
    """
    if not candidates:
        raise ValueError("at least one elbow candidate is required")
    minimum_crossings = min(int(item["crossings"]) for item in candidates)
    crossing_winners = [
        item for item in candidates if int(item["crossings"]) == minimum_crossings
    ]
    safe = [
        item for item in crossing_winners
        if float(item["clearance_m"]) >= float(safety_clearance_m)
    ]
    if safe:
        return min(
            safe,
            key=lambda item: (
                float(item["continuity_m"]),
                -float(item["clearance_m"]),
                int(item.get("sample_index", 0)),
            ),
        )
    return min(
        crossing_winners,
        key=lambda item: (
            -float(item["clearance_m"]),
            float(item["continuity_m"]),
            int(item.get("sample_index", 0)),
        ),
    )
