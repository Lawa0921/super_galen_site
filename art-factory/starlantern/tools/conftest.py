"""Shared test safety for the art-factory tools: no test may write the real prompts folder (review minor, 2026-10-20).
Every job builder that writes prompt files (batch, gear_art, party, portal) is pointed at a temp folder for every test."""
import pytest


@pytest.fixture(autouse=True)
def _temp_prompts(tmp_path_factory, monkeypatch):
    import batch, faces, gear_art, party, portal
    d = tmp_path_factory.mktemp('prompts')
    for mod in (batch, faces, gear_art, party, portal):
        monkeypatch.setattr(mod, 'PROMPTS', d)
