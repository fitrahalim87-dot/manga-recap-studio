import { MotionType, ScenePlan } from '../types';

export const PAN_MOTIONS: MotionType[] = [
  'pan-top-to-bottom',
  'pan-bottom-to-top',
  'pan-left-to-right',
  'pan-right-to-left',
];

export function resolveMotion(m: string): MotionType {
  const lower = (m || '').toLowerCase();
  if (lower.includes('random') || lower.includes('smart') || lower.includes('multi') || lower.includes('flow')) {
    const choices: MotionType[] = [...PAN_MOTIONS, 'zoom-in', 'zoom-out'];
    return choices[Math.floor(Math.random() * choices.length)];
  }
  if (lower.includes('top-to-bottom')) return 'pan-top-to-bottom';
  if (lower.includes('bottom-to-top')) return 'pan-bottom-to-top';
  if (lower.includes('left-to-right')) return 'pan-left-to-right';
  if (lower.includes('right-to-left')) return 'pan-right-to-left';
  if (lower.includes('zoom-out')) return 'zoom-out';
  return 'zoom-in';
}

export function ease(p: number, kind: 'smooth' | 'linear' = 'smooth'): number {
  const clamped = Math.min(Math.max(p, 0.0), 1.0);
  return kind === 'linear' ? clamped : clamped * clamped * (3 - 2 * clamped);
}

export interface WindowBox {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function calcWindowBox(
  iw: number,
  ih: number,
  W: number,
  H: number,
  motion: MotionType,
  p: number,
  speed: number = 1.0,
  kind: 'smooth' | 'linear' = 'smooth'
): WindowBox {
  const ar = W / H;
  let bw: number;
  let bh: number;

  if (iw / ih > ar) {
    bh = ih;
    bw = bh * ar;
  } else {
    bw = iw;
    bh = bw / ar;
  }

  const e = ease(p, kind);
  const k = Math.min(Math.max(speed, 0.1), 3.0);
  const pan_e = 0.5 + (e - 0.5) * Math.min(k, 1.0);

  let z = 0.72;
  const amt = Math.min(0.38 * k, 0.6);

  if (motion === 'zoom-in') {
    z = 1.0 - amt * e;
  } else if (motion === 'zoom-out') {
    z = 1.0 - amt * (1 - e);
  }

  const ww = bw * z;
  const wh = bh * z;
  const rx = iw - ww;
  const ry = ih - wh;

  let x = rx / 2;
  let y = ry / 2;

  if (motion === 'pan-left-to-right') {
    x = rx * pan_e;
  } else if (motion === 'pan-right-to-left') {
    x = rx * (1 - pan_e);
  } else if (motion === 'pan-top-to-bottom') {
    y = ry * pan_e;
  } else if (motion === 'pan-bottom-to-top') {
    y = ry * (1 - pan_e);
  }

  x = Math.min(Math.max(x, 0), Math.max(rx, 0));
  y = Math.min(Math.max(y, 0), Math.max(ry, 0));

  return {
    sx: x,
    sy: y,
    sw: Math.min(ww, iw - x),
    sh: Math.min(wh, ih - y),
  };
}

export function drawPanelFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  plan: ScenePlan,
  progress: number,
  W: number,
  H: number
) {
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  if (!iw || !ih) return;

  const box = calcWindowBox(iw, ih, W, H, plan.motion, progress, plan.speed, plan.easing);

  ctx.drawImage(
    img,
    box.sx,
    box.sy,
    box.sw,
    box.sh,
    0,
    0,
    W,
    H
  );
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds || 0);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${String(r).padStart(2, '0')}.${ms}`;
}
