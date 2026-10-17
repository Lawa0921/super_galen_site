"""Construction stage classification for source-authored RTS components."""
import re

THRESHOLDS = [0, 0.18, 0.55, 0.82]
STAGES = [{'id': i, 'name': name} for i, name in enumerate([
    'foundation-courtyard', 'bearing-structure', 'roof-gables', 'openings-fittings'])]

def classify_stage(name, category, instance_id=''):
    if category not in {'foundation', 'structure', 'roof', 'window', 'door', 'ornament'}:
        raise ValueError('Unregistered construction component category: ' + category)
    if category == 'foundation' or instance_id.startswith('courtyard'):
        return 0
    if category in {'window', 'door', 'ornament'}:
        return 3
    if category == 'roof' or re.search(r'\b(?:roof|slate|eaves|ridge|gable|rake board)\b', name, re.I):
        return 2
    if re.search(r'\b(?:foundation|plinth)\b', name, re.I):
        return 0
    if re.search(r'\b(?:polearm rack|training spear|hay bedding|horse stall dark bay|stall cross rail|horse trough|workbench|wheel|gear|hoist|hook chain|freestanding crane)\b', name, re.I):
        return 3
    return 1
