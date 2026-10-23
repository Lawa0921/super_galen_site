/**
 * Waiting for the pixel font (legibility Task 4): the Pixi layer draws its text once, into a texture, so a font that is
 * still loading would leave those words in a fallback face. The game waits for Cubic 11 before its first scene, at most
 * `timeoutMs`; a font that is slow, blocked or missing never holds the game up longer, and never throws.
 */
export async function loadPixelFont(fonts: Pick<FontFaceSet, 'load'> = document.fonts, timeoutMs = 3000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
  const load = Promise.resolve()
    .then(() => fonts.load('12px "Cubic 11"'))
    .then((faces) => faces.length > 0, () => false);
  try {
    return await Promise.race([load, late]);
  } finally {
    clearTimeout(timer);
  }
}
