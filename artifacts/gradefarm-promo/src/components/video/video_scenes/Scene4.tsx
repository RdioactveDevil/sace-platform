import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 8500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-transparent"
      {...sceneTransitions.zoomThrough}
    >
      <div className="absolute inset-0 z-0">
         <img 
            src={`${import.meta.env.BASE_URL}images/bg-abstract.png`} 
            className="w-full h-full object-cover opacity-30 mix-blend-screen"
            alt="Abstract Background"
          />
      </div>

      <div className="relative z-20 text-center flex flex-col items-center">
        <motion.h2 
          className="font-body font-bold text-[5vw] text-white leading-tight"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          Built for Australia.
        </motion.h2>
        
        <div className="overflow-hidden mt-4">
          <motion.h2 
            className="font-body font-bold text-[5vw] text-accent leading-tight"
            initial={{ y: "100%" }}
            animate={phase >= 1 ? { y: 0 } : { y: "100%" }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          >
            In Australia.
          </motion.h2>
        </div>

        <motion.p
          className="mt-8 text-[1.8vw] text-text-secondary tracking-wide uppercase font-medium"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1 }}
        >
          By Titanium Tutoring
        </motion.p>
      </div>
    </motion.div>
  );
}
