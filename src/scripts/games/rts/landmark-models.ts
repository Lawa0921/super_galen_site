/** Original modular prefabs, authored in metres with ground-centred pivots. */
export const MAP_LANDMARK_MODELS={
  river:['river-gatehouse','river-shrine'],
  pass:['highland-watchtower','quarry-ruins'],
} as const;
export type LandmarkAssetId=typeof MAP_LANDMARK_MODELS[keyof typeof MAP_LANDMARK_MODELS][number];
export const LANDMARK_MODELS:readonly string[]=[...MAP_LANDMARK_MODELS.river,...MAP_LANDMARK_MODELS.pass];
