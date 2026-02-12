import { TouchableOpacity } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme, useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export function ThemeToggle() {
  const { setPreference } = useTheme();
  const colorScheme = useColorScheme();

  const handleToggle = () => {
    setPreference(colorScheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <TouchableOpacity
      onPress={handleToggle}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={`Switch to ${colorScheme === 'dark' ? 'light' : 'dark'} mode`}
      accessibilityRole="button"
    >
      <IconSymbol
        name={colorScheme === 'dark' ? 'sun.max.fill' : 'moon.fill'}
        size={22}
        color={Colors[colorScheme].icon}
      />
    </TouchableOpacity>
  );
}
