export type MotionType =
  | 'random'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-top-to-bottom'
  | 'pan-bottom-to-top'
  | 'pan-left-to-right'
  | 'pan-right-to-left';

export interface PanelItem {
  id: string;
  name: string;
  url: string;
  file?: File;
  width?: number;
  height?: number;
  imageElement?: HTMLImageElement;
}

export interface ScenePlan {
  motion: MotionType;
  speed: number;
  easing: 'smooth' | 'linear';
  duration: number;
  transition: 'crossfade' | 'none';
}

export interface VideoConfig {
  width: number;
  height: number;
  fps: number;
  transitionSec: number;
  aspectRatio: '16:9' | '9:16';
  defaultMotion: MotionType;
}

export interface SyncResult {
  starts: number[];
  durations: number[];
  confidences: number[];
  source?: string;
}
