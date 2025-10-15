// Radar.tsx
import { motion } from 'framer-motion';
import { Radar as RadarIcon } from 'lucide-react';

const Radar = () => (
  <div className="relative w-full h-full overflow-hidden bg-black">
    {/* Concentric radar circles */}
    {[1, 2, 3, 4, 5].map((i) => (
      <motion.div
        key={i}
        className="absolute top-1/2 left-1/2 rounded-full border-2"
        style={{
          width: `${i * 120}px`,
          height: `${i * 120}px`,
          marginLeft: `${-i * 60}px`,
          marginTop: `${-i * 60}px`,
          borderColor: `rgba(0, 255, 0, ${0.4 - i * 0.05})`,
          boxShadow: `0 0 ${20 + i * 5}px rgba(0, 255, 0, ${0.6 - i * 0.08})`,
        }}
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          delay: i * 0.2,
          ease: "easeInOut",
        }}
      />
    ))}

    {/* Rotating radar sweep */}
    <motion.div
      className="absolute top-1/2 left-1/2"
      style={{
        width: '200vw',
        height: '200vw',
        marginLeft: '-100vw',
        marginTop: '-100vw',
        background: 'conic-gradient(from 0deg, transparent 0deg, rgba(0, 255, 0, 0.4) 20deg, transparent 40deg)',
        transformOrigin: 'center',
      }}
      animate={{
        rotate: 360,
      }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: "linear",
      }}
    />

    {/* Pulsing center icon */}
    <motion.div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.6, 1, 0.6],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <RadarIcon 
        size={48} 
        color="#00ff00" 
        strokeWidth={2}
        style={{
          filter: 'drop-shadow(0 0 10px rgba(0, 255, 0, 0.8))',
        }}
      />
    </motion.div>

    {/* Scanning lines */}
    {[0, 45, 90, 135].map((angle) => (
      <motion.div
        key={angle}
        className="absolute top-1/2 left-1/2 w-1 h-full origin-top"
        style={{
          background: `linear-gradient(to bottom, rgba(0, 255, 0, 0.3), transparent)`,
          transform: `rotate(${angle}deg)`,
        }}
        animate={{
          opacity: [0.2, 0.5, 0.2],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          delay: angle / 180,
          ease: "easeInOut",
        }}
      />
    ))}
  </div>
);

export default Radar;
