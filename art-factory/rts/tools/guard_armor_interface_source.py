"""Measured source for coherent armor-interface fit after the early Attack fix."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_articulation_source import BASE, main

if __name__ == '__main__':
    main(source=BASE/'2026-10-08-v29-attack-start-exterior-tangent/candidate/guard-authored-attack.blend',
         source_sha='d010152889219efed40023ef689b14b9440562c6bb3f3e2d00acc5da62381d54',
         run=BASE/'2026-10-08-v30-armor-interface-fit')
