"""Shared test safety for the art-factory tools: no test may write the real prompts folder (review minor, 2026-10-20).
Every job builder that writes prompt files (batch, gear_art, party, portal, roster_art) is pointed at a temp folder for every test."""
import pytest


@pytest.fixture(autouse=True)
def _temp_prompts(tmp_path_factory, monkeypatch):
    import batch, faces, g4_art, gear_art, party, portal, roster_art, rune_art
    d = tmp_path_factory.mktemp('prompts')
    for mod in (batch, faces, g4_art, gear_art, party, portal, roster_art, rune_art):
        monkeypatch.setattr(mod, 'PROMPTS', d)
