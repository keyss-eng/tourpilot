import type { AITourConfig } from '../api/types';

// tooltip/theme — resolves the tooltip color palette from config.theme
// ('light' | 'dark' | 'auto'). 'auto' follows the OS prefers-color-scheme.
export interface ThemeColors {
  themeBg: string;
  themeText: string;
  themeMuted: string;
  themeBorder: string;
  themeAccent: string;
}

export function getThemeColors(config?: AITourConfig): ThemeColors {
  const theme = config?.theme ?? 'light';
  let themeBg = '#ffffff';
  let themeText = '#111827';
  let themeMuted = '#4b5563';
  let themeBorder = '#e5e7eb';
  let themeAccent = '#111827';

  if (theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    themeBg = '#1f2937';
    themeText = '#f9fafb';
    themeMuted = '#9ca3af';
    themeBorder = '#374151';
    themeAccent = '#3b82f6';
  }
  return { themeBg, themeText, themeMuted, themeBorder, themeAccent };
}
