"""Check file-backed asset evidence independently of artistic/rights approval."""
from pathlib import Path
import hashlib

EVIDENCE_FIELDS = ('raw', 'candidate', 'source', 'qa', 'prompt', 'provenance',
                   'source_manifest', 'editable_source', 'terms_record', 'original_source')
SOURCE_PROVIDERS = {'builtin-imagegen', 'original_3d_render'}


def verify_asset_sources(root: Path, asset: dict) -> dict:
    root = root.resolve()
    verified, unbound, resolved = [], [], set()
    for field in EVIDENCE_FIELDS:
        relative = asset.get(field)
        if not relative or (field == 'source' and relative in SOURCE_PROVIDERS):
            continue
        target = (root / relative).resolve()
        if not target.is_relative_to(root):
            raise ValueError(f"{asset['id']}: {field} outside project root: {relative}")
        if not target.is_file():
            raise ValueError(f"{asset['id']}: missing {field}: {relative}")
        expected = asset.get(field + '_sha256')
        # Published candidate is the exact processed runtime asset, not its raw input.
        published = asset.get('sha256') if field == 'candidate' else None
        if expected or published:
            actual = hashlib.sha256(target.read_bytes()).hexdigest()
            if expected and actual != expected:
                raise ValueError(f"{asset['id']}: {field} SHA256 mismatch: {relative}")
            if published and actual != published:
                raise ValueError(f"{asset['id']}: candidate differs from published SHA256: {relative}")
            verified.append(field)
            if expected:
                resolved.add(field + '_sha256')
        else:
            unbound.append(field)
    unresolved = [field + '_sha256' for field in EVIDENCE_FIELDS
                  if asset.get(field + '_sha256') and field + '_sha256' not in resolved]
    return {'verified_fields': verified, 'unbound_fields': unbound,
            'unresolved_hash_fields': unresolved}
