// Static camera: fits the whole track into the canvas with padding.

import type { Track } from '../sim/types';

export interface Camera {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function fitTrack(track: Track, width: number, height: number, padding = 60): Camera {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of track.samples) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const scale = Math.min((width - 2 * padding) / w, (height - 2 * padding) / h);
  return {
    scale,
    offsetX: width / 2 - (minX + w / 2) * scale,
    // canvas y grows downward; flip so track "north" is up
    offsetY: height / 2 + (minY + h / 2) * scale,
  };
}

export function toScreen(cam: Camera, x: number, y: number): [number, number] {
  return [x * cam.scale + cam.offsetX, -y * cam.scale + cam.offsetY];
}
