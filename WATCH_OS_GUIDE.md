# Watch OS Optimized Alerts Guide

## Overview
The **PlaneAlertz Watch** version is specifically optimized for Watch OS devices, supporting both **round (circular)** and **square (rectangular)** watch screens.

## Features

### 🎯 Screen Optimization
- **Automatic Detection**: Detects screen shape (round vs square) and adapts layout accordingly
- **Round Screens**: Circular UI with 15% padding to avoid edge clipping
- **Square Screens**: Rounded rectangle design with 10px padding for maximum screen usage

### 📱 Watch-Specific Design
- **Large Touch Targets**: All buttons are minimum 44x44 points for easy tapping
- **Simplified Interface**: Shows only essential information
- **Battery Optimized**: Reduced animations and efficient rendering
- **OLED Friendly**: True black backgrounds for OLED displays

### ✨ Key Features
1. **Real-time Aircraft Detection**: Scans for new aircraft in your area
2. **Compact Information Display**:
   - Aircraft callsign/registration
   - Aircraft type
   - Altitude (feet)
   - Speed (km/h)
   - Route (origin → destination)
3. **Sound Alerts**: Toggle sonar sound for new aircraft
4. **Adjustable Range**: Set scanning radius (default: 10 NM)
5. **Countdown Timer**: Visual feedback for next scan

### 🎨 Adaptive UI Elements
- **Round Screen Mode**:
  - Circular card layout
  - Optimized padding (15%)
  - Larger icons (40-50px)
  - Centered content
  
- **Square Screen Mode**:
  - Rounded rectangle card
  - Efficient padding (10px)
  - Slightly smaller icons (35-45px)
  - Maximized content area

### 🔧 Settings
Access settings via the refresh icon (top-left):
- **Range**: Adjust scanning radius in nautical miles
- Saved to local storage for persistence

### 🎵 Sound Control
Toggle sound alerts via the speaker icon (top-right):
- Volume2 icon: Sound enabled
- VolumeX icon: Sound muted
- Preference saved to local storage

## Technical Optimizations

### Performance
- **Reduced Motion Support**: Respects system accessibility settings
- **High Contrast Mode**: Enhanced borders for better visibility
- **Touch Optimization**: Prevents double-tap zoom and text selection
- **Smooth Animations**: Hardware-accelerated transforms

### Display
- **Retina Display Ready**: Subpixel antialiasing for crisp text
- **Always-On Display**: Reduced brightness in low-power mode
- **True Black**: OLED-optimized backgrounds

### Accessibility
- **Focus Indicators**: Clear focus states for keyboard navigation
- **Reduced Motion**: Animations disabled when preferred
- **High Contrast**: Enhanced borders and colors
- **Touch Targets**: Minimum 44x44 point tap areas

## Usage

### Accessing Watch Version
Navigate to `/alertz-watch` or use the "Watch OS" button in the navigation bar.

### First Launch
1. Grant location permissions when prompted
2. Wait for initial aircraft scan
3. New aircraft will trigger alerts automatically

### Interaction
- **Tap Settings Icon**: Adjust scanning range
- **Tap Sound Icon**: Toggle audio alerts
- **View Aircraft**: Information updates automatically when new aircraft detected

## Data Display

### When Scanning
- Radio icon with pulse animation
- Aircraft count nearby
- Countdown to next scan

### When Aircraft Detected
- Plane icon
- Callsign or registration (bold)
- Aircraft type
- Altitude and speed in grid layout
- Route information (if available)

## Browser Compatibility
- Best experienced in standalone mode (Add to Home Screen)
- Supports all modern browsers with geolocation API
- Optimized for WebKit (Safari) on Apple Watch

## API Integration
Uses the same backend as main PlaneAlertz:
- **Primary**: adsbdb.com API
- **Fallback**: Custom details API
- **Tertiary**: hexdb.io
- **Data Source**: adsb.fi (configurable)

## Storage
Local storage keys used:
- `watchRadius`: Scanning radius preference
- `watchSoundEnabled`: Sound alert preference
- `colorMode`: Color scheme (inherited from main app)

## Tips for Best Experience
1. **Add to Home Screen**: For true standalone experience
2. **Enable Location**: Required for aircraft detection
3. **Keep Screen On**: For continuous monitoring
4. **Adjust Range**: Start with 10 NM, increase if needed
5. **Battery Saver**: Disable sound if conserving battery

## Differences from Main App
- No map view (optimized for small screens)
- Simplified settings (only range adjustment)
- Auto-detection only (no manual aircraft selection)
- Reduced animation complexity
- Optimized for quick glances

## Future Enhancements
- [ ] Complications support
- [ ] Haptic feedback
- [ ] Watch face integration
- [ ] Offline mode
- [ ] Favorite aircraft alerts
- [ ] Distance to aircraft display
