# 🛩️ Snailwatch

> **Real-time aircraft tracking with a retro terminal aesthetic**

Snailwatch is a sleek web application that tracks aircraft in your vicinity in real-time using ADS-B data. Watch the skies come alive with live flight information, complete with typewriter animations and a nostalgic green-on-black radar interface.

![License](https://img.shields.io/badge/license-MIT-green)
![React](https://img.shields.io/badge/React-19.1.1-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue)
![Vite](https://img.shields.io/badge/Vite-7.1.7-purple)

---

## ✨ Features

- **🌍 Location-Based Tracking** - Automatically detects your location or set custom coordinates
- **📡 Real-Time Updates** - Fetches aircraft data every 10 seconds within your specified radius
- **✈️ Detailed Aircraft Info** - View ICAO codes, registration, manufacturer, type, and owner information
- **🎨 Retro UI** - Terminal-inspired design with typewriter text effects and radar animations
- **⚙️ Customizable Settings** - Adjust search radius and location preferences
- **🔄 Multiple Data Sources** - Falls back through multiple aircraft databases for comprehensive coverage
- **📱 Responsive Design** - Works seamlessly on desktop and mobile devices

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Access to an ADS-B data API endpoint

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/snailwatch.git
cd snailwatch

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`

---

## 🛠️ Tech Stack

- **Frontend Framework:** React 19.1.1
- **Language:** TypeScript 5.9.3
- **Build Tool:** Vite 7.1.7
- **Styling:** TailwindCSS 4.1.14
- **Animations:** Framer Motion 12.23.24
- **Icons:** Lucide React 0.545.0

---

## 📡 API Configuration

Snailwatch requires an ADS-B data API. Configure your API endpoints in the application:

- **Primary API:** `/api/lat/{lat}/lon/{lon}/dist/{radius}`
- **Aircraft Details:** `/details-api/aircraft/{hex}`

The app also supports fallback to public APIs:
- [adsbdb.com](https://api.adsbdb.com)
- [hexdb.io](https://hexdb.io)

---

## ⚙️ Configuration

### Local Database Loading

By default, the app uses remote APIs only. To enable local ICAO database loading:

1. **Extract the database** - Unzip `icaorepo.json` to the `public/` folder
2. **Enable loading** - Modify `src/App.tsx`:

```typescript
const LOAD_LOCAL_DATABASE = true; // Set to true to load local JSON database
```

### Default Settings

- **Refresh Interval:** 10 seconds
- **Default Radius:** 20 km
- **Fallback Location:** LAX (33.9416, -118.4085)

---

## 🎮 Usage

1. **Grant Location Permission** - Allow the app to access your location for accurate tracking
2. **View Aircraft** - Watch as aircraft enter your tracking radius
3. **Click Settings** - Customize your tracking radius or set a custom location
4. **Explore Details** - New aircraft are automatically highlighted with detailed information

---

## 🏗️ Project Structure

```
snailwatch/
├── src/
│   ├── App.tsx              # Main application component
│   ├── App.css              # Application styles
│   ├── main.tsx             # Application entry point
│   └── assets/              # Static assets
├── public/                  # Public assets
├── package.json             # Dependencies and scripts
├── vite.config.ts           # Vite configuration
└── tailwind.config.js       # TailwindCSS configuration
```

---

## 🧪 Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

---

## 🎨 Features in Detail

### Typewriter Effect
Aircraft details appear with a satisfying typewriter animation, enhancing the retro terminal aesthetic.

### Radar Background
Animated radar sweep effect creates an immersive tracking experience.

### Smart Detection
Automatically detects new aircraft entering your tracking radius and displays their information.

### Multiple Data Sources
Intelligently falls back through multiple aircraft databases to ensure maximum data availability.

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 🙏 Acknowledgments

- ADS-B data providers
- [Lucide](https://lucide.dev) for beautiful icons
- [Framer Motion](https://www.framer.com/motion/) for smooth animations
- The aviation community for open aircraft databases

---

## 📧 Contact

Have questions or suggestions? Open an issue or reach out!

---

<div align="center">
  <strong>Happy Tracking! ✈️</strong>
  <br>
  <sub>Videcoded with Disdain</sub>
</div>
