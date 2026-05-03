import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

export const SCENE_DURATIONS: Record<string, number> = {
  open: 5000,
  adaptive: 10000,
  tutor: 10000,
  aussie: 10000,
  close: 10000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  open: Scene1,
  adaptive: Scene2,
  tutor: Scene3,
  aussie: Scene4,
  close: Scene5,
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <div className="w-full h-screen overflow-hidden relative bg-[var(--color-bg-dark)] font-body text-white text-primary">
      
      {/* Persistent Background Layer */}
      <div className="absolute inset-0 z-0">
        <motion.div 
          className="absolute inset-0 opacity-40 mix-blend-screen"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-navy.png)`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          animate={{ scale: [1, 1.05, 1], filter: ['brightness(1)', 'brightness(1.2)', 'brightness(1)'] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div className="absolute w-[80vw] h-[80vw] rounded-full opacity-20 blur-[80px]"
          style={{ background: 'radial-gradient(circle, var(--color-accent), transparent)' }}
          animate={{ 
            x: ['-20%', '20%', '-10%'], 
            y: ['10%', '-20%', '30%'],
            scale: [1, 1.2, 0.9]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }} 
        />
      </div>

      {/* Persistent Midground Layers */}
      <motion.div 
        className="absolute w-[2px] bg-accent/50 z-10"
        animate={{
          left: ['10%', '20%', '80%', '50%', '50%'][sceneIndex],
          top: ['0%', '0%', '20%', '0%', '0%'][sceneIndex],
          height: ['100%', '100%', '60%', '100%', '0%'][sceneIndex],
          opacity: sceneIndex === 4 ? 0 : 0.5
        }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      />
      
      <motion.div 
        className="absolute border border-accent/20 rounded-full z-10"
        animate={{
          width: ['10vw', '40vw', '20vw', '60vw', '30vw'][sceneIndex],
          height: ['10vw', '40vw', '20vw', '60vw', '30vw'][sceneIndex],
          left: ['80%', '10%', '70%', '50%', '50%'][sceneIndex],
          top: ['20%', '50%', '15%', '50%', '50%'][sceneIndex],
          x: '-50%',
          y: '-50%',
          opacity: [0.3, 0.1, 0.4, 0.1, 0][sceneIndex],
        }}
        transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
      />

      <div className="relative z-20 w-full h-full">
        <AnimatePresence initial={false} mode="wait">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
