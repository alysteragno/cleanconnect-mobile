import { useTheme } from '@/context/ThemeContext'
import { Colors, DarkColors } from '@/constants/colors'

export function useThemeColors() {
  const { isDark } = useTheme()
  return isDark ? DarkColors : Colors
}
