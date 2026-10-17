"""Run the pinned, proven neural/projection stages for original human inputs.

This creates unrigged art-factory candidates only. It never publishes runtime art.
The guard pilot CLI retains its historical filenames inside each isolated run.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--units', nargs='+', default=['worker', 'crossbow', 'priest', 'commander', 'neutral-raider'])
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    factory = root/'art-factory/rts'
    tools = factory/'tools'
    upstream = args.cache/'TripoSR'
    weights = args.cache/'model'
    dino = args.cache/'dino-config/config.json'
    for unit in args.units:
        if unit not in ['worker', 'crossbow', 'priest', 'commander', 'neutral-raider']:
            raise ValueError(f'Unknown original input: {unit}')
        inputs = factory/'runs/unit-inputs'/unit/'v1/raw'
        run = factory/'runs/unit-bodies'/unit/'v1'
        run.mkdir(parents=True, exist_ok=True)
        neural, projected = run/'neural', run/'projected'
        stages = [
            [sys.executable, str(tools/'neural_pilot_v2.py'), '--input', str(inputs/'front.png'),
             '--upstream', str(upstream), '--weights', str(weights), '--dino-config', str(dino),
             '--v1-texture', str(inputs/'front.png'), '--run-dir', str(neural), '--no-remove-bg'],
            [sys.executable, str(tools/'neural_pilot_v3.py'), '--front', str(inputs/'front.png'),
             '--rear', str(inputs/'back.png'), '--uv-mesh', str(neural/'candidate/guard-neural-uv.obj'),
             '--neural-texture', str(neural/'candidate/guard-neural-albedo-2048.png'),
             '--upstream', str(upstream), '--run-dir', str(projected)],
        ]
        for index, command in enumerate(stages):
            print(f'{unit} stage {index+1}/2', flush=True)
            with (run/f'stage-{index+1}.log').open('w', encoding='utf-8', newline='\n') as log:
                subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True)
        # Keep generated mesh bytes intact; normalize only text QA reports.
        for report in run.rglob('*.json'):
            report.write_text(report.read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
        record = {'unit': unit, 'status': 'unrigged_candidate',
                  'input_run': f'runs/unit-inputs/{unit}/v1',
                  'geometry': 'neural/candidate/guard-neural-uv.obj',
                  'projected_texture': 'projected/candidate/guard-projected-albedo-2048.png',
                  'comparison_note': 'The historical v1_baked_rgb diagnostic compares the same original front reference, not an earlier bake. No v1 was generated for this unit.',
                  'runtime_published': False}
        (run/'source.json').write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8', newline='\n')
        print(f'{unit} body candidate complete', flush=True)


if __name__ == '__main__':
    main()
