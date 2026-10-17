"""Independent static GLB and factory QA for five finite human candidates."""

import argparse
import hashlib
import json
import struct
from pathlib import Path

from PIL import Image, ImageDraw

from human_units_spec import UNITS


EXACT_CLIPS = {'Idle', 'Walk', 'Attack', 'Hurt', 'Death'}


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def glb_json(path):
    with Path(path).open('rb') as stream:
        magic, version, length = struct.unpack('<4sII', stream.read(12))
        if magic != b'glTF' or version != 2 or length != Path(path).stat().st_size:
            raise ValueError('Invalid GLB header or length')
        chunk_length, chunk_type = struct.unpack('<I4s', stream.read(8))
        if chunk_type != b'JSON':
            raise ValueError('First GLB chunk must be JSON')
        return json.loads(stream.read(chunk_length))


def inspect_glb(path, expect_team):
    doc = glb_json(path)
    clips = [animation.get('name') for animation in doc.get('animations', [])]
    joints = [len(skin.get('joints', [])) for skin in doc.get('skins', [])]
    materials = [material.get('name', '') for material in doc.get('materials', [])]
    images = [image.get('mimeType') for image in doc.get('images', [])]
    failures = []
    if set(clips) != EXACT_CLIPS or len(clips) != 5 or any(not animation.get('channels') for animation in doc.get('animations', [])):
        failures.append('clips_exact')
    if joints != [20]:
        failures.append('skin_20_joints')
    if expect_team and not any('teamcloth' in name.lower() for name in materials):
        failures.append('team_material')
    if not expect_team and any('teamcloth' in name.lower() for name in materials):
        failures.append('neutral_has_team_material')
    if any(mime != 'image/jpeg' for mime in images):
        failures.append('jpeg_images')
    return {'path':str(path),'bytes':Path(path).stat().st_size,'sha256':sha256(path),
            'clips':clips,'joints_per_skin':joints,'materials':materials,'image_mime_types':images,
            'failures':failures,'passed':not failures}


def frame_grid(qa, clip):
    paths = sorted(qa.glob(clip.lower() + '-[0-9][0-9].png'))
    if len(paths) < 4:
        raise ValueError(f'{clip}: expected at least four motion frames')
    tiles = []
    for path in paths:
        with Image.open(path) as original:
            image = original.convert('RGBA')
        tile = Image.new('RGB',(200,268),(34,38,44))
        tile.paste(image,(0,0),image)
        ImageDraw.Draw(tile).text((8,245),path.stem,fill=(235,235,235))
        tiles.append(tile)
    grid = Image.new('RGB',(len(tiles)*200,268),(34,38,44))
    for index,tile in enumerate(tiles):
        grid.paste(tile,(index*200,0))
    path = qa / (clip.lower() + '-framegrid.png')
    grid.save(path)
    return {'path':str(path),'sha256':sha256(path),'frames':len(paths)}


def verify(root, unit):
    run = root / 'art-factory/rts/runs/human-units/2026-10-05-v1' / unit
    candidate,qa = run/'candidate',run/'qa'
    build = json.loads((qa/'production-build.json').read_text(encoding='utf-8'))
    prep = json.loads((qa/'material-prep.json').read_text(encoding='utf-8'))
    glbs = {lod:inspect_glb(candidate/f'{unit}-production-{lod}.glb',UNITS[unit]['teamcloth']) for lod in ('lod0','lod1')}
    raw = run/'raw'/f'{unit}-projected-albedo-2048.png'
    source_unchanged = sha256(raw) == prep['source_albedo_sha256'] == sha256(prep['source_albedo'])
    ground = build['ground']
    ground_pass = all(item['body_min_z_m'] >= -.015 for samples in ground.values() for item in samples)
    weight_pass = all(not item['unweighted'] and item['max_influences'] <= 4 and item['max_weight_sum_error'] <= .01 for item in build['weights'].values())
    triangles = build['triangles']
    triangle_pass = triangles['lod0_total'] < 20000 and 7000 <= triangles['lod1_total'] <= 10000
    combined = sum(item['bytes'] for item in glbs.values())
    grids = {clip:frame_grid(qa,clip) for clip in ('Walk','Attack','Death')}
    report = {'unit':unit,'glbs':glbs,'source_raw_sha_matches':source_unchanged,'weights_pass':weight_pass,
              'ground_pass':ground_pass,'triangle_pass':triangle_pass,'combined_glb_bytes':combined,
              'combined_under_3mb_target':combined < 3000000,'framegrids':grids,
              'passed_static':all(item['passed'] for item in glbs.values()) and source_unchanged and ground_pass and weight_pass and triangle_pass,
              'requires_human_visual_review':True,'runtime_publish_allowed':False}
    (qa/'production-verify.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project-root',type=Path,required=True)
    parser.add_argument('--unit',choices=UNITS,required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.project_root.resolve(),args.unit)))


if __name__ == '__main__':
    main()
