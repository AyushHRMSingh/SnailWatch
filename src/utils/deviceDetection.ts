/**
 * Device Detection Utility
 * Detects device type and characteristics for optimal UI rendering
 */

export interface DeviceInfo {
  isWearable: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isRoundScreen: boolean;
  screenSize: 'tiny' | 'small' | 'medium' | 'large' | 'xlarge';
  viewport: {
    width: number;
    height: number;
  };
}

/**
 * Detect if the device is a wearable (smartwatch)
 */
export function isWearableDevice(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  };
  
  // Check for known wearable user agents
  const wearableUAs = [
    'watch',
    'wearos',
    'wear os',
    'galaxy watch',
    'apple watch',
    'watchos',
    'tizen',
    'fitbit',
    'garmin',
    'huawei watch',
    'fossil',
    'ticwatch',
    'amazfit'
  ];
  
  const hasWearableUA = wearableUAs.some(device => ua.includes(device));
  
  // Check viewport size - wearables typically have very small screens
  // Apple Watch: 162x197 to 205x251
  // Wear OS: varies but typically 280x280 to 454x454
  const maxDimension = Math.max(viewport.width, viewport.height);
  const minDimension = Math.min(viewport.width, viewport.height);
  const isVerySmallScreen = maxDimension <= 500 && minDimension <= 500;
  
  // Check if screen is roughly square (common for watches)
  const aspectRatio = maxDimension / minDimension;
  const isSquareish = aspectRatio <= 1.5;
  
  // Check for standalone mode (PWA installed)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       (window.navigator as any).standalone === true;
  
  // Wearable if: has wearable UA OR (very small screen + squareish + standalone)
  return hasWearableUA || (isVerySmallScreen && isSquareish && isStandalone);
}

/**
 * Detect if screen is round (circular display)
 */
export function isRoundScreen(): boolean {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  };
  
  // Round screens are typically perfectly square or very close
  const diff = Math.abs(viewport.width - viewport.height);
  const isSquare = diff <= 10;
  
  // Check for round screen media query (if supported)
  const hasRoundMediaQuery = window.matchMedia('(shape: round)').matches;
  
  // Check viewport size - round watches are typically small
  const maxDimension = Math.max(viewport.width, viewport.height);
  const isSmall = maxDimension <= 300;
  
  return hasRoundMediaQuery || (isSquare && isSmall);
}

/**
 * Detect if device is mobile (phone)
 */
export function isMobileDevice(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const viewport = window.innerWidth;
  
  // Check user agent
  const mobileUAs = [
    'android',
    'iphone',
    'ipod',
    'blackberry',
    'windows phone',
    'mobile'
  ];
  
  const hasMobileUA = mobileUAs.some(device => ua.includes(device));
  
  // Exclude tablets and wearables
  const isNotTablet = !ua.includes('ipad') && !ua.includes('tablet');
  const isNotWearable = !isWearableDevice();
  
  // Check viewport (phones typically < 768px)
  const hasPhoneViewport = viewport < 768;
  
  return (hasMobileUA && isNotTablet && isNotWearable) || 
         (hasPhoneViewport && isNotWearable && 'ontouchstart' in window);
}

/**
 * Detect if device is tablet
 */
export function isTabletDevice(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const viewport = window.innerWidth;
  
  // Check user agent
  const tabletUAs = ['ipad', 'tablet', 'kindle', 'playbook', 'nexus 7', 'nexus 10'];
  const hasTabletUA = tabletUAs.some(device => ua.includes(device));
  
  // Check viewport (tablets typically 768px - 1024px)
  const hasTabletViewport = viewport >= 768 && viewport <= 1024;
  
  // Has touch but not mobile or wearable
  const hasTouch = 'ontouchstart' in window;
  const isNotMobile = !isMobileDevice();
  const isNotWearable = !isWearableDevice();
  
  return hasTabletUA || (hasTabletViewport && hasTouch && isNotMobile && isNotWearable);
}

/**
 * Detect if device is desktop
 */
export function isDesktopDevice(): boolean {
  return !isWearableDevice() && !isMobileDevice() && !isTabletDevice();
}

/**
 * Get screen size category
 */
export function getScreenSize(): 'tiny' | 'small' | 'medium' | 'large' | 'xlarge' {
  const width = window.innerWidth;
  
  if (width < 400) return 'tiny';      // Wearables, small phones
  if (width < 768) return 'small';     // Phones
  if (width < 1024) return 'medium';   // Tablets, small laptops
  if (width < 1440) return 'large';    // Laptops, desktops
  return 'xlarge';                     // Large desktops
}

/**
 * Get complete device information
 */
export function getDeviceInfo(): DeviceInfo {
  return {
    isWearable: isWearableDevice(),
    isMobile: isMobileDevice(),
    isTablet: isTabletDevice(),
    isDesktop: isDesktopDevice(),
    isRoundScreen: isRoundScreen(),
    screenSize: getScreenSize(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  };
}

/**
 * Log device info for debugging
 */
export function logDeviceInfo(): void {
  const info = getDeviceInfo();
  console.log('🔍 Device Detection:', {
    ...info,
    userAgent: navigator.userAgent,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    touch: 'ontouchstart' in window
  });
}
