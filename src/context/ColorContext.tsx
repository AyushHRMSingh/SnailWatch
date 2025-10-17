import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

type ColorMode = 'classic' | 'pns';

interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  bgDark: string;
  shadow: string;
}

interface ColorContextType {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  currentColors: ColorScheme;
}

const colorSchemes: Record<ColorMode, ColorScheme> = {
  classic: {
    primary: '#00ff00',
    secondary: '#00ff88',
    accent: '#00ff44',
    background: 'rgba(0,40,0,0.98)',
    bgDark: '#000800',
    shadow: 'rgba(0,255,0,0.9)',
  },
  pns: {
    primary: '#eed571',
    secondary: '#f4e4a6',
    accent: '#e8c84f',
    background: 'rgba(40,20,82,0.98)',
    bgDark: 'rgb(16, 8, 82)',
    shadow: 'rgba(238, 213, 113, 0.9)',
  },
};

const ColorContext = createContext<ColorContextType | undefined>(undefined);

export function ColorProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>(() => 
    (localStorage.getItem('colorMode') as ColorMode) || 'pns'
  );

  const currentColors = colorSchemes[colorMode];

  const setColorMode = (mode: ColorMode) => {
    setColorModeState(mode);
    localStorage.setItem('colorMode', mode);
  };

  // Apply color scheme to CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', currentColors.primary);
    root.style.setProperty('--color-secondary', currentColors.secondary);
    root.style.setProperty('--color-accent', currentColors.accent);
    root.style.setProperty('--color-background', currentColors.background);
    root.style.setProperty('--color-bg-dark', currentColors.bgDark);
    root.style.setProperty('--color-shadow', currentColors.shadow);
  }, [currentColors]);

  return (
    <ColorContext.Provider value={{ colorMode, setColorMode, currentColors }}>
      {children}
    </ColorContext.Provider>
  );
}

export function useColors() {
  const context = useContext(ColorContext);
  if (context === undefined) {
    throw new Error('useColors must be used within a ColorProvider');
  }
  return context;
}
