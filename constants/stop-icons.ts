import { StopType } from '@/types/route';

export interface StopIconConfig {
  ios: string;
  default: string;
  color: string;
}

export const STOP_ICON_MAPPING: Record<StopType, StopIconConfig> = {
  restaurant: {
    ios: 'fork.knife',
    default: 'restaurant',
    color: '#FF6B6B',
  },
  cafe: {
    ios: 'cup.and.saucer.fill',
    default: 'local-cafe',
    color: '#8B4513',
  },
  bar: {
    ios: 'wineglass.fill',
    default: 'local-bar',
    color: '#9B59B6',
  },
  park: {
    ios: 'tree.fill',
    default: 'park',
    color: '#2ECC71',
  },
  museum: {
    ios: 'building.columns.fill',
    default: 'museum',
    color: '#3498DB',
  },
  theater: {
    ios: 'theatermasks.fill',
    default: 'theaters',
    color: '#E74C3C',
  },
  viewpoint: {
    ios: 'eye.fill',
    default: 'visibility',
    color: '#F39C12',
  },
  activity: {
    ios: 'figure.run',
    default: 'directions-run',
    color: '#1ABC9C',
  },
  shopping: {
    ios: 'bag.fill',
    default: 'shopping-bag',
    color: '#E91E63',
  },
};

export function getStopIcon(type: StopType): StopIconConfig {
  return STOP_ICON_MAPPING[type];
}
