"""Keep file availability distinct from reviewed production art quality."""


def quality_summary(missing, current_hashes, review):
    review = review or {}
    gates = review.get('gates', {})
    required = {'character_art', 'unit_actions', 'building_lifecycle', 'map_art',
                'interface_art', 'audio', 'source_rights', 'gameplay', 'release_validation'}
    approved = (not missing and bool(current_hashes) and review.get('status') == 'approved'
                and review.get('asset_hashes') == current_hashes
                and review.get('blocking_issues') == [] and required <= gates.keys()
                and all(value == 'passed' for value in gates.values()))
    return {'required_model_files_present': not missing,
            'complete_game_art_pack': approved,
            'commercial_quality_approved': approved}
