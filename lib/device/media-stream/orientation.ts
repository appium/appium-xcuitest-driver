export type Rotation = 0 | 90 | 180 | 270;

export interface DisplayGeometry {
  /** The visible size in pixels, which is smaller than the stream: the device pads it to a multiple of 16 */
  width: number;
  height: number;
  /** Clockwise degrees that make the stream's picture upright, if the display reported its orientation */
  rotation?: Rotation;
}

interface DisplayEntry {
  displayId?: number;
  primary?: boolean;
  currentOrientation?: string;
  currentMode?: {size?: unknown};
}

/**
 * Reads the visible size and the rotation of a display from CoreDevice's `getDisplayInfo()`.
 *
 * The device always streams the display's native portrait buffer and says nothing about its orientation, so a
 * landscape UI arrives turned. The display reports it as `currentOrientation`: `rot0`, `rot90`, `rot180` or
 * `rot270`, and the stream needs turning clockwise by exactly that many degrees (verified on an iPad in all
 * but the upside-down orientation, which follows from the others).
 *
 * @param info The result of `getDisplayInfo()`
 * @param displayId The display to read; the primary one by default
 * @returns `undefined` if the display or its size cannot be found
 */
export function parseDisplayGeometry(info: unknown, displayId?: number): DisplayGeometry | undefined {
  const displays = (info as {displays?: DisplayEntry[]} | undefined)?.displays;
  if (!Array.isArray(displays)) {
    return undefined;
  }
  const display =
    displayId === undefined
      ? (displays.find((d) => d.primary) ?? displays[0])
      : displays.find((d) => d.displayId === displayId);
  const size = display?.currentMode?.size;
  if (
    !Array.isArray(size) ||
    !Number.isInteger(size[0]) ||
    !Number.isInteger(size[1]) ||
    size[0] <= 0 ||
    size[1] <= 0
  ) {
    return undefined;
  }
  return {width: size[0], height: size[1], rotation: parseRotation(display?.currentOrientation)};
}

function parseRotation(orientation: string | undefined): Rotation | undefined {
  const degrees = /^rot(0|90|180|270)$/.exec(orientation ?? '')?.[1];
  return degrees === undefined ? undefined : (Number(degrees) as Rotation);
}
