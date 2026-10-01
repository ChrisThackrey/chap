// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight } from 'expo-symbols';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

import { ICON_MAPPING, type IconSymbolName } from './icon-symbol-names';

export type { IconSymbolName } from './icon-symbol-names';

export interface IconSymbolProps {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and are mapped to Material Icons in `icon-symbol-names.ts`.
 */
export function IconSymbol({ name, size = 24, color, style }: IconSymbolProps) {
  return <MaterialIcons color={color} size={size} name={ICON_MAPPING[name]} style={style} />;
}
