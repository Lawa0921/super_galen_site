"""Bounded original Attack_R0..4 authoring, preserving the approved9..18 arc."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_attack_author import BASE, main


if __name__ == '__main__':
    main(source=BASE/'2026-10-08-v25-authored-attack/candidate/guard-authored-attack.blend',
         source_sha='a57e17a559d60a3912b77d6e5cb6708e888a5e73181e2c5d5e517cb1af103c35',
         run=BASE/'2026-10-08-v29-attack-start-exterior-tangent', start=0., end=4., knots=[0., 4.],
         wrist_delta={}, pole_override={}, pole_mode='transported-angle', endpoint_policy='outside')
