/** Visual pace for the in-browser chain. The check itself is not delayed. */
export const TILE_REVEAL_MS = 25;

export function revealImmediately(reduceMotion: boolean): boolean {
  return reduceMotion;
}
