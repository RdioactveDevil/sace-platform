import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-transparent"
      {...sceneTransitions.fadeBlur}
    >
      <div className="relative text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="overflow-hidden"
        >
          <h1 className="font-display text-[8vw] leading-none text-white tracking-tighter">
            gradefarm<span className="text-accent">.</span>
          </h1>
        </motion.div>
        
        <motion.div
          className="mt-6 overflow-hidden h-[3vw]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <motion.p 
            className="text-[2vw] font-body text-text-secondary tracking-widest uppercase font-light"
            initial={{ y: "100%" }}
            animate={phase >= 2 ? { y: 0 } : { y: "100%" }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          >
            Adaptive SACE Practice
          </motion.p>
        </motion.div>
      </div>
    </motion.div>
  );
}
