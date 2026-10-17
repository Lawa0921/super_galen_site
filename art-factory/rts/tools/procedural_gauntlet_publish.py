"""Package and publish the procedural-gauntlet rebuilds of worker, crossbow and guard.

  stage   : raw Blender GLB -> lossless image externalization (unit_shared_textures.externalize_images),
            URIs rebound to byte-identical shipped files where they exist (detail-v1, unit-shared), and the
            guard's 512 surface PNGs rebound to the JPEG encodings the published guard already ships.
            Writes candidate/<id>.glb plus any new texture files under public/.../materials/unit-shared.
  publish : copies the staged candidates to public/assets/games/rts/models, updates unit-registry.json
            and the commercial unit source audit. Requires qa/evidence.json and qa/gltf-validator.json.
Run with Blender's bundled Python: python.exe procedural_gauntlet_publish.py stage|publish
"""
import hashlib
import json
import shutil
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from unit_shared_textures import externalize_images, verify_externalization  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
RUNS = ROOT / "art-factory/rts/runs/procedural-gauntlet"
MODELS = ROOT / "public/assets/games/rts/models"
MATERIALS = ROOT / "public/assets/games/rts/materials"
REGISTRY = ROOT / "art-factory/rts/manifests/unit-registry.json"
AUDIT = ROOT / "art-factory/rts/runs/commercial-readiness/2026-10-09/qa/published-unit-source-audit.json"
UNITS = ("worker", "crossbow", "guard")
EVIDENCE = RUNS / "2026-10-09-evidence-a2"
RUN_DIRS = {"worker": "2026-10-09-worker", "crossbow": "2026-10-09-crossbow-a2", "guard": "2026-10-09-guard-a2"}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_glb(path: Path):
    data = path.read_bytes()
    assert data[:4] == b"glTF"
    jlen = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack_from("<I", data, off)[0]
    return doc, data[off + 8:off + 8 + blen]


def write_glb(path: Path, doc, binary: bytes):
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    binary = binary + b"\0" * ((-len(binary)) % 4)
    body = struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(binary), b"BIN\0") + binary
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)


def shipped_index():
    index = {}
    for p in MATERIALS.rglob("*"):
        if p.is_file():
            index[sha(p.read_bytes())] = "../materials/" + p.relative_to(MATERIALS).as_posix()
    return index


def published_names(unit: str):
    """Image name -> URI in the currently published GLB (for the guard's JPEG surface encodings)."""
    doc, _ = read_glb(MODELS / f"{unit}.glb")
    return {im.get("name"): im["uri"] for im in doc.get("images", []) if "uri" in im and im.get("name")}


def stage():
    index = shipped_index()
    rows = []
    for unit in UNITS:
        run = RUNS / RUN_DIRS[unit]
        by_name = published_names(unit) if unit == "guard" else {}
        for lod in (0, 1):
            ident = unit + ("-lod1" if lod else "")
            raw = run / "candidate" / f"{unit}-lod{lod}.raw.glb"
            doc, binary = read_glb(raw)
            # Blender's exporter can emit texCoord -1 when a material is shared by several exported meshes;
            # every primitive here carries exactly TEXCOORD_0, so the only valid set is 0.
            fixed_texcoords = 0
            for mat in doc.get("materials", []):
                infos = [mat.get("normalTexture"), mat.get("occlusionTexture"), mat.get("emissiveTexture"),
                         (mat.get("pbrMetallicRoughness") or {}).get("baseColorTexture"),
                         (mat.get("pbrMetallicRoughness") or {}).get("metallicRoughnessTexture")]
                for info in infos:
                    if info is not None and info.get("texCoord", 0) < 0:
                        info.pop("texCoord")
                        fixed_texcoords += 1
            out, packed, files = externalize_images(doc, binary)
            verify_externalization(doc, binary, out, packed, files)
            rebinds = []
            for image in out.get("images", []):
                uri = image.get("uri")
                data = files.get(uri)
                if data is None:
                    continue
                digest = sha(data)
                if digest in index:
                    image["uri"] = index[digest]
                    rebinds.append({"name": image.get("name"), "uri": image["uri"], "mode": "byte-identical shipped file"})
                elif image.get("name") in by_name and (MODELS / by_name[image["name"]]).is_file():
                    image["uri"] = by_name[image["name"]]
                    image["mimeType"] = "image/jpeg"
                    rebinds.append({"name": image.get("name"), "uri": image["uri"], "mode": "published guard JPEG encoding of the same surface",
                                    "source_png_sha256": digest})
                else:
                    target = MATERIALS / "unit-shared" / uri.rsplit("/", 1)[-1]
                    if not target.exists():
                        target.write_bytes(data)
                    index[digest] = "../materials/unit-shared/" + target.name
                    rebinds.append({"name": image.get("name"), "uri": image["uri"], "mode": "new shared file"})
            dest = run / "candidate" / f"{ident}.glb"
            write_glb(dest, out, packed)
            check, _ = read_glb(dest)
            for image in check.get("images", []):
                assert (MODELS / image["uri"]).is_file(), image
            rows.append({"id": ident, "raw": raw.relative_to(ROOT).as_posix(), "raw_sha256": sha(raw.read_bytes()),
                         "candidate": dest.relative_to(ROOT).as_posix(), "sha256": sha(dest.read_bytes()),
                         "bytes": dest.stat().st_size, "images": rebinds, "texcoord_minus_one_fixed": fixed_texcoords,
                         "geometry_animation_parity": "verify_externalization passed before URI rebinding"})
    (RUNS / "packaging.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    print(json.dumps([{k: r[k] for k in ("id", "bytes", "sha256")} for r in rows], indent=1))


def provenance(unit, build):
    common = {"hunyuan_geometry": "none",
              "tool": build["tool"], "tool_sha256": build["tool_sha256"],
              "removed_restricted_objects": build["removed_restricted_objects"],
              "rights_note": "Technical source tracing only; not a legal certification."}
    if unit == "worker":
        return {**common, "geometry": "procedural-original closed-grip gauntlet (code primitives) + TripoSR (MIT) body, "
                                      "original Blender rig/axe/clips from worker-production-v1.blend; axe rigidly re-seated",
                "clean_source": build["source_blend"]}
    if unit == "crossbow":
        return {**common, "geometry": "procedural-original closed-grip gauntlets and crossbow (stock, prod, string, stirrup, trigger; "
                                      "code primitives) + untouched TripoSR (MIT) body from crossbow-production-v1.blend; baked clips "
                                      "with both arm chains re-solved by IK to carry the weapon 8 cm further forward",
                "clean_source": build["source_blend"], "clean_body_source": build.get("clean_body_source")}
    return {**common, "geometry": "TripoSR (MIT) body from the original guard concept (guard-neural-pilot production-v1, "
                                  "same pipeline as the other human units) + procedural-original steel gauntlets (code primitives), "
                                  "original Blender sword/shield; authored guard clips (rtsMotion) from the original guard rig",
            "clean_source": build["source_blend"], "clips_source": build.get("clips_blend")}


SHARED_REGISTRY = ROOT / "art-factory/rts/manifests/unit-shared-material-registry.json"


def register_shared_textures(packaging):
    """Every unit-shared texture the new GLBs reference must be a registered runtime asset."""
    registry = json.loads(SHARED_REGISTRY.read_text(encoding="utf-8"))
    known = {a["url"] for a in registry["assets"]}
    users = {}
    for ident, row in packaging.items():
        doc, _ = read_glb(ROOT / row["candidate"])
        for image in doc.get("images", []):
            uri = image.get("uri", "")
            if uri.startswith("../materials/unit-shared/"):
                users.setdefault(uri, (row, []))[1].append(ident)
    added = []
    for uri, (row, providers) in sorted(users.items()):
        url = "/assets/games/rts/materials/unit-shared/" + uri.rsplit("/", 1)[-1]
        if url in known:
            continue
        public = ROOT / "public" / url.lstrip("/")
        data = public.read_bytes()
        assert sha(data) == public.stem
        candidate = RUNS / "candidate-materials/unit-shared" / public.name
        candidate.parent.mkdir(parents=True, exist_ok=True)
        candidate.write_bytes(data)
        registry["assets"].append({
            "id": "unit-shared-" + public.name, "status": "published", "url": url, "bytes": len(data), "sha256": sha(data),
            "candidate": candidate.relative_to(ROOT).as_posix(),
            "source": row["raw"], "source_sha256": row["raw_sha256"],
            "qa": "art-factory/rts/runs/procedural-gauntlet/packaging.json",
            "provider_models": sorted(providers), "runtime_publish_allowed": True, "commercial_quality_approved": False,
            "note": "Exact encoded bytes embedded by Blender in the candidate GLB (TripoSR body/team-cloth atlases); externalized losslessly."})
        added.append(url)
    SHARED_REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return added


def publish():
    packaging = {r["id"]: r for r in json.loads((RUNS / "packaging.json").read_text(encoding="utf-8"))}
    evidence = json.loads((EVIDENCE / "evidence.json").read_text(encoding="utf-8"))
    assert not evidence["errors"], evidence["errors"]
    validator = json.loads((RUNS / "gltf-validator.json").read_text(encoding="utf-8"))
    assert all(v["numErrors"] == 0 for v in validator), validator
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    published = []
    for unit in UNITS:
        run = RUNS / RUN_DIRS[unit]
        build = json.loads((run / "qa/build.json").read_text(encoding="utf-8"))
        for lod in (0, 1):
            ident = unit + ("-lod1" if lod else "")
            row = packaging[ident]
            src = ROOT / row["candidate"]
            assert sha(src.read_bytes()) == row["sha256"]
            key = f"{unit}-lod{lod}"
            assert evidence["sources"][key]["sha256"] == row["sha256"], "Evidence was not rendered from this candidate: " + ident
            dest = MODELS / f"{ident}.glb"
            previous = sha(dest.read_bytes())
            shutil.copy2(src, dest)
            assert sha(dest.read_bytes()) == row["sha256"]
            entry = next(a for a in registry["assets"] if a["id"] == ident)
            if str(entry.get("source", "")).startswith("art-factory/rts/runs/procedural-gauntlet/"):
                superseded = entry.get("superseded_restricted_record")
                prior_procedural = {k: entry[k] for k in ("sha256", "candidate", "source") if k in entry}
            else:
                superseded = {k: entry[k] for k in ("sha256", "candidate", "source", "source_sha256") if k in entry}
                superseded["reason"] = "Contained Hunyuan3D-2.1-derived geometry (EU/UK/KR territory exclusion); replaced 2026-10-09"
                superseded["previous_published_sha256"] = previous
                prior_procedural = None
            new = {"id": ident, "status": "published", "url": f"/assets/games/rts/models/{ident}.glb",
                   "bytes": row["bytes"], "sha256": row["sha256"], "candidate": row["candidate"], "candidate_sha256": row["sha256"],
                   "source": build["raw_blend"], "source_sha256": build["raw_blend_sha256"],
                   "qa": f"art-factory/rts/runs/procedural-gauntlet/{RUN_DIRS[unit]}/qa/build.json",
                   "evidence": "art-factory/rts/runs/procedural-gauntlet/2026-10-09-evidence-a2/evidence.json",
                   "packaging": "art-factory/rts/runs/procedural-gauntlet/packaging.json",
                   "validator": "art-factory/rts/runs/procedural-gauntlet/gltf-validator.json",
                   "qa_sha256": sha((run / "qa/build.json").read_bytes()),
                   "source_provenance": provenance(unit, build), "triangles": build["triangle_totals"][str(lod)],
                   "runtime_publish_allowed": True, "publication_scope": "local worktree only",
                   "user_overall_art_acceptance": "pending", "superseded_restricted_record": superseded}
            if prior_procedural and prior_procedural["sha256"] != row["sha256"]:
                new["previous_procedural_record"] = prior_procedural
            registry["assets"][registry["assets"].index(entry)] = new
            published.append({"id": ident, "sha256": row["sha256"], "previous_sha256": previous})
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    register_shared_textures(packaging)
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    for unit in UNITS:
        record = audit["units"][unit]
        if record.get("hunyuan_geometry_dependency") == "removed":
            prior = record.get("prior_audit_record")
        else:
            prior = {k: record[k] for k in list(record) if k != "runtime_assets"}
            prior["runtime_assets"] = record["runtime_assets"]
        rows = [p for p in published if p["id"] in (unit, unit + "-lod1")]
        record.clear()
        record.update({
            "runtime_assets": [{"id": p["id"], "url": f"/assets/games/rts/models/{p['id']}.glb", "sha256": p["sha256"]} for p in rows],
            "hunyuan_geometry_dependency": "removed",
            "current_backend": provenance(unit, json.loads((RUNS / RUN_DIRS[unit] / "qa/build.json").read_text(encoding="utf-8")))["geometry"],
            "source_evidence": ["art-factory/rts/tools/procedural_gauntlet_build.py",
                                f"art-factory/rts/runs/procedural-gauntlet/{RUN_DIRS[unit]}/qa/build.json",
                                "art-factory/rts/tools/procedural_crossbow_build.py",
                                "src/scripts/games/rts/unit-source-rights.test.ts"],
            "rights_approval": False,
            "remediated": "2026-10-09",
            "prior_audit_record": prior})
        if unit == "crossbow":
            record["prior_classification_correction"] = (
                "The prior record said no_evidence, which was wrong: the published crossbow contained "
                "OriginalCrossbowClosedGrip_L/R appended from the worker's Hunyuan-derived grip "
                "(tools/original_crossbow_grip_build.py:385-397) and a body whose wrists were fitted to that grip "
                "(tools/original_crossbow_continuation_geometry.py). Both are gone; the body is the untouched production body.")
    audit["status"] = "RESTRICTED_GEOMETRY_REMOVED_FROM_WORKER_CROSSBOW_GUARD"
    audit["remediation"] = {"date": "2026-10-09", "tool": "art-factory/rts/tools/procedural_gauntlet_build.py",
                            "gate": "src/scripts/games/rts/unit-source-rights.test.ts"}
    AUDIT.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (RUNS / "publication.json").write_text(json.dumps({"status": "published", "scope": "local worktree only",
                                                       "assets": published}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(published, indent=1))


if __name__ == "__main__":
    {"stage": stage, "publish": publish}[sys.argv[1]]()
