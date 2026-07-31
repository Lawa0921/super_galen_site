import type { JobId } from './jobs';
import { previewGenesisForge } from './genesisForge';

export function previewJobOrigins(job: JobId, traits: string[]) {
  return traits.map((trait) => previewGenesisForge({
    job,
    trait,
    stats: {
      str: 12,
      dex: 12,
      int: 12,
      cha: 12,
      con: 12,
    },
  }));
}
