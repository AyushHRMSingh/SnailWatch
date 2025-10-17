/**
 * WearOS Detector Utility
 * Detects if the device is a smartwatch based on display characteristics
 */

export interface WearOSDetectionResult {
  isWearOS: boolean;
  screenWidth: number;
  screenHeight: number;
  aspectRatio: number;
  isCircular: boolean;
}

export class WearOSDetector {
  private static readonly MAX_DIMENSION = 560;
  private static readonly ASPECT_RATIO_TOLERANCE = 0.15; // 15% tolerance for 1:1 ratio

  /**
   * Detects if the current device is a WearOS smartwatch
   * Criteria:
   * - Display dimensions up to 560x560px
   * - Aspect ratio close to 1:1 (square/circular)
   */
  static detectWearOS(): WearOSDetectionResult {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspectRatio = width / height;
    
    // Check if dimensions are within smartwatch range
    const withinDimensions = width <= this.MAX_DIMENSION && height <= this.MAX_DIMENSION;
    
    // Check if aspect ratio is close to 1:1 (allowing some tolerance)
    const isSquareAspect = Math.abs(aspectRatio - 1) <= this.ASPECT_RATIO_TOLERANCE;
    
    // Detect if the display is circular (WearOS API)
    const isCircular = this.detectCircularDisplay();
    
    const isWearOS = withinDimensions && isSquareAspect;

    return {
      isWearOS,
      screenWidth: width,
      screenHeight: height,
      aspectRatio,
      isCircular,
    };
  }

  /**
   * Detects if the display is circular using CSS media queries
   */
  private static detectCircularDisplay(): boolean {
    // Check for round screen media query (supported by WearOS)
    if (window.matchMedia && window.matchMedia('(shape: round)').matches) {
      return true;
    }
    
    // Fallback: assume circular if dimensions suggest it
    // Most round watches have dimensions between 280x280 and 454x454
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspectRatio = width / height;
    
    return Math.abs(aspectRatio - 1) < 0.05 && width >= 280 && width <= 454;
  }

  /**
   * Checks if we should redirect to WearOS page
   */
  static shouldRedirectToWearOS(): boolean {
    const result = this.detectWearOS();
    return result.isWearOS;
  }

  /**
   * Gets the optimal display mode for the current device
   */
  static getDisplayMode(): 'circular' | 'square' | 'standard' {
    const result = this.detectWearOS();
    
    if (!result.isWearOS) {
      return 'standard';
    }
    
    return result.isCircular ? 'circular' : 'square';
  }
}
