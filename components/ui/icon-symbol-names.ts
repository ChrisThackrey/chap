import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import type { SFSymbol } from 'sf-symbols-typescript';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

/**
 * Single source of truth for every icon the app renders.
 *
 * Keys are SF Symbol names (rendered natively on iOS via expo-symbols) and values
 * are the Material Icons fallback used on Android and web. Both sides are
 * type-checked: an invalid SF Symbol or Material Icon name fails `tsc`, and any
 * `IconSymbol` usage with a name missing from this table also fails to compile.
 */
export const ICON_MAPPING = {
  // Navigation / tabs
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'map.fill': 'map',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'chevron.down': 'expand-more',

  // Stop types
  'fork.knife': 'restaurant',
  'cup.and.saucer.fill': 'local-cafe',
  'wineglass.fill': 'local-bar',
  'tree.fill': 'park',
  'building.columns.fill': 'museum',
  'theatermasks.fill': 'theaters',
  'eye.fill': 'visibility',
  'figure.run': 'directions-run',
  'bag.fill': 'shopping-bag',

  // Location / map
  'location.viewfinder': 'my-location',
  'location.fill': 'location-on',
  'location.slash': 'location-off',
  'mappin': 'place',
  'mappin.circle.fill': 'place',
  'mappin.and.ellipse': 'pin-drop',
  'circle.dashed': 'radio-button-unchecked',
  'parkingsign.circle.fill': 'local-parking',
  'arrow.triangle.turn.up.right.diamond.fill': 'directions',
  'arrow.up.left.and.arrow.down.right': 'fullscreen',
  'arrow.left.and.right': 'swap-horiz',
  'arrow.up.forward': 'open-in-new',
  'car': 'directions-car',

  // Theme
  'sun.max.fill': 'light-mode',
  'moon.fill': 'dark-mode',

  // Actions
  'plus': 'add',
  'plus.circle': 'add-circle-outline',
  'plus.circle.fill': 'add-circle',
  'minus.circle.fill': 'remove-circle',
  'xmark': 'close',
  'xmark.circle.fill': 'cancel',
  'trash': 'delete',
  'bookmark': 'bookmark-border',
  'magnifyingglass': 'search',
  'sparkles': 'auto-awesome',

  // Status / info
  'exclamationmark.triangle': 'warning-amber',
  'info.circle': 'info-outline',
  'checkmark.seal.fill': 'verified',
  'clock': 'schedule',
  'clock.fill': 'access-time-filled',
  'star.fill': 'star',
  'star.leadinghalf.filled': 'star-half',
  'quote.bubble.fill': 'format-quote',
} as const satisfies Partial<Record<SFSymbol, MaterialIconName>>;

export type IconSymbolName = keyof typeof ICON_MAPPING;
