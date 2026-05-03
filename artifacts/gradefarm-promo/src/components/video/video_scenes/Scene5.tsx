import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 8500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-bg-dark"
      {...sceneTransitions.fadeBlur}
    >
      <motion.div 
        className="w-[1px] bg-accent absolute top-0"
        initial={{ height: 0 }}
        animate={{ height: "40vh" }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      />
      
      <div className="relative text-center mt-[10vh]">
        <motion.h1 
          className="font-display text-[9vw] leading-none text-white tracking-tighter"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          gradefarm<span className="text-accent">.</span>
        </motion.h1>
        
        <motion.div
          className="mt-8"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1 }}
        >
          <p className="text-[1.8vw] font-body text-text-secondary tracking-widest uppercase font-light">
            Start Practicing Today
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
