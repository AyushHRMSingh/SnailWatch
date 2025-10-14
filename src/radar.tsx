// Radar.tsx
import { motion } from 'framer-motion';

const Radar = () => (
  <div className="relative w-full h-full overflow-hidden bg-black">
    <motion.div
      className="absolute top-1/2 left-1/2 w-96 h-96 border-4 border-green-500 rounded-full animate-spin-slow"
      style={{
        transformOrigin: 'center',
        borderRadius: '50%',
        borderWidth: '4px',
        borderColor: 'rgba(34, 197, 94, 0.5)',
        boxShadow: '0 0 10px rgba(34, 197, 94, 0.8)',
      }}
    />
    <motion.div
      className="absolute top-1/2 left-1/2 w-96 h-96 border-4 border-green-500 rounded-full animate-spin-slow"
      style={{
        transformOrigin: 'center',
        borderRadius: '50%',
        borderWidth: '4px',
        borderColor: 'rgba(34, 197, 94, 0.5)',
        boxShadow: '0 0 10px rgba(34, 197, 94, 0.8)',
      }}
    />
  </div>
);

export default Radar;
