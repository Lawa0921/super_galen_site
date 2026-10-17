"""Portable lookup for the approved Commander source-tool modules."""

import os
from pathlib import Path


_REQUIRED = ("procedural_gauntlet_build.py", "commander_assembly_hands.py")


def _is_approved_tools(path: Path) -> bool:
    return path.is_dir() and all((path / name).is_file() for name in _REQUIRED)


def resolve_approved_tools(script_tools: Path, environ=None) -> Path:
    """Return the approved tool directory available from this worktree.

    An explicit ``KNIGHT_APPROVED_TOOLS`` override is supported for CI and
    release rebuilds. Otherwise, look for the sibling Claude RTS worktree by
    walking upwards from this script's tool directory. The required modules
    are checked before returning so a missing or stale path fails loudly.
    """
    env = os.environ if environ is None else environ
    candidates = []
    override = env.get("KNIGHT_APPROVED_TOOLS")
    if override:
        candidates.append(Path(override).expanduser())

    script_tools = Path(script_tools).resolve()
    candidates.append(script_tools)
    for ancestor in (script_tools, *script_tools.parents):
        candidates.append(ancestor / ".claude" / "worktrees" / "rts" / "art-factory" / "rts" / "tools")

    seen = set()
    for candidate in candidates:
        candidate = candidate.resolve()
        if candidate in seen:
            continue
        seen.add(candidate)
        if _is_approved_tools(candidate):
            return candidate

    searched = ", ".join(str(path) for path in candidates)
    raise FileNotFoundError(
        "Approved Commander tools not found; set KNIGHT_APPROVED_TOOLS or provide "
        f"the sibling RTS worktree. Searched: {searched}"
    )
