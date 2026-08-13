export type Theme = 'Dark' | 'Light' | 'System';

export interface ThemeService {
  getCurrentTheme(): Theme;
  setTheme(theme: Theme): void;
  onThemeChanged(callback: (theme: Theme) => void): void;
}
