import type { IconSymbolName } from '@/components/ui/icon-symbol-names';
import type { StopType } from '@/types/route';

export interface StopIconConfig {
  /** Icon name from the shared icon table (SF Symbol on iOS, Material Icon elsewhere). */
  icon: IconSymbolName;
  color: string;
}

export const STOP_ICON_MAPPING: Record<StopType, StopIconConfig> = {
  restaurant: { icon: 'fork.knife', color: '#FF6B6B' },
  cafe: { icon: 'cup.and.saucer.fill', color: '#8B4513' },
  bar: { icon: 'wineglass.fill', color: '#9B59B6' },
  park: { icon: 'tree.fill', color: '#2ECC71' },
  museum: { icon: 'building.columns.fill', color: '#3498DB' },
  theater: { icon: 'theatermasks.fill', color: '#E74C3C' },
  viewpoint: { icon: 'eye.fill', color: '#F39C12' },
  activity: { icon: 'figure.run', color: '#1ABC9C' },
  shopping: { icon: 'bag.fill', color: '#E91E63' },
};

/**
 * Look up the icon config for a stop type. Unknown types (e.g. from older saved
 * routes or unexpected AI output) fall back to the generic "activity" icon
 * instead of crashing on an undefined config.
 */
export function getStopIcon(type: StopType | string | undefined): StopIconConfig {
  return (type && STOP_ICON_MAPPING[type as StopType]) || STOP_ICON_MAPPING.activity;
}
