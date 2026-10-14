/** Kept separate so production and unflagged pages cannot opt in accidentally. */
export function useSkinCandidate(development: boolean, search: string) {
  return development && new URLSearchParams(search).get('skinCandidate') === '1';
}
