import { SymbolView, SymbolWeight } from 'expo-symbols';
import { OpaqueColorValue, type StyleProp, type ViewStyle } from 'react-native';

import type { IconSymbolName } from './icon-symbol-names';

export type { IconSymbolName } from './icon-symbol-names';

export interface IconSymbolProps {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}

export function IconSymbol({ name, size = 24, color, style, weight = 'regular' }: IconSymbolProps) {
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[{ width: size, height: size }, style]}
    />
  );
}
