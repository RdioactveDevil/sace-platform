import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 8500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-row-reverse items-center bg-transparent px-[10vw]"
      {...sceneTransitions.slideRight}
    >
      <div className="w-1/2 pl-12 relative z-20">
        <motion.div 
          className="w-16 h-1 bg-accent mb-8"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          style={{ originX: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        />
        
        <motion.h2 
          className="font-body font-bold text-[4.5vw] leading-[1.1] text-white"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          Your personal <br/>
          <span className="text-gradient">AI Tutor.</span>
        </motion.h2>
        
        <motion.p 
          className="text-[1.5vw] text-text-secondary mt-6 max-w-lg leading-relaxed"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          Stuck on a concept? Get instant, step-by-step guidance tailored to the SACE curriculum.
        </motion.p>
      </div>
      
      <div className="w-1/2 relative h-full flex items-center justify-center">
        <motion.div
          className="w-[35vw] h-[45vw] rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-accent/20 relative"
          initial={{ opacity: 0, scale: 0.8, y: 50 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.8, y: 50 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/ui-tutor.png`} 
            className="w-full h-full object-cover"
            alt="AI Tutor UI"
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
