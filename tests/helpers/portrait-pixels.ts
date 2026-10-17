export interface PortraitPixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export function portraitPixelsMatch(first: PortraitPixels, later: PortraitPixels): boolean {
  if (first.width !== later.width || first.height !== later.height) return false;
  if (!Number.isInteger(first.width) || !Number.isInteger(first.height) || first.width <= 0 || first.height <= 0) return false;
  const length = first.width * first.height * 4;
  if (first.data.length !== length || later.data.length !== length) return false;
  for (let i = 0; i < length; i++) {
    if (Math.abs(first.data[i] - later.data[i]) > 1) return false;
  }
  return true;
}
