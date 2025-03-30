import React, { useEffect, useRef, useState, forwardRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF, Points, Point } from '@react-three/drei';
import * as THREE from 'three';
import { getGeometricModel, MODEL_URLS } from '../models';
import Leaderboard from './Leaderboard';

// Create a checkerboard texture
const textureSize = 512;
const data = new Uint8Array(textureSize * textureSize * 4);
const size = 64; // Size of each square in the checkerboard

for (let i = 0; i < textureSize; i++) {
  for (let j = 0; j < textureSize; j++) {
    const offset = (i * textureSize + j) * 4;
    const isEven = (Math.floor(i / size) + Math.floor(j / size)) % 2 === 0;
    // Using white and dark blue for maximum contrast
    if (isEven) {
      data[offset] = 255;     // R (white)
      data[offset + 1] = 255; // G (white)
      data[offset + 2] = 255; // B (white)
    } else {
      data[offset] = 20;      // R (dark blue)
      data[offset + 1] = 20;  // G (dark blue)
      data[offset + 2] = 100; // B (dark blue)
    }
    data[offset + 3] = 255;   // A
  }
}

const checkerboardTexture = new THREE.DataTexture(
  data,
  textureSize,
  textureSize,
  THREE.RGBAFormat
);
checkerboardTexture.needsUpdate = true;
checkerboardTexture.wrapS = THREE.RepeatWrapping;
checkerboardTexture.wrapT = THREE.RepeatWrapping;
checkerboardTexture.repeat.set(5, 50); // Repeat the texture to make it more visible

function CollisionBox({ min, max, color }: { min: THREE.Vector3; max: THREE.Vector3; color: string }) {
  const width = max.x - min.x;
  const height = max.y - min.y;
  const depth = max.z - min.z;
  const position = new THREE.Vector3(
    min.x + width / 2,
    min.y + height / 2,
    min.z + depth / 2
  );

  return (
    <mesh position={position}>
      <boxGeometry args={[width, height, depth]} />
      <meshBasicMaterial color={color} wireframe={true} />
    </mesh>
  );
}

function useAnimations(state: 'idle' | 'left' | 'right' | 'crash', onCrashComplete?: () => void) {
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const crashRotation = useRef(0);
  const animationFrame = useRef<number>();

  useEffect(() => {
    if (state === 'crash') {
      let lastTime = performance.now();
      
      const animate = (currentTime: number) => {
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;
        
        crashRotation.current += deltaTime * 10;
        
        if (crashRotation.current <= Math.PI * 2) {
          setRotation({ 
            x: Math.sin(crashRotation.current) * Math.PI / 2,
            y: 0,
            z: 0
          });
          animationFrame.current = requestAnimationFrame(animate);
        } else {
          setRotation({ x: Math.PI / 2, y: 0, z: 0 });
          if (onCrashComplete) {
            onCrashComplete();
          }
        }
      };
      
      animationFrame.current = requestAnimationFrame(animate);
      
      return () => {
        if (animationFrame.current) {
          cancelAnimationFrame(animationFrame.current);
        }
      };
    } else {
      crashRotation.current = 0;
      switch (state) {
        case 'left':
          setRotation({ x: 0, y: 0, z: 0.3 });
          break;
        case 'right':
          setRotation({ x: 0, y: 0, z: -0.3 });
          break;
        default:
          setRotation({ x: 0, y: 0, z: 0 });
      }
    }
  }, [state, onCrashComplete]);

  return rotation;
}

const OBSTACLES = {
  tree: {
    scale: { x: 5, y: 5, z: 5 },
    yOffset: 5,
    collisionRadius: 0.3,
    collisionHeight: 2,
    weight: 0.4,
  },
  rock: {
    scale: { x: 2, y: 2, z: 2 },
    yOffset: 2,
    collisionRadius: 1.0,
    collisionHeight: 1.5,
    weight: 0.3,
  },
  bump: {
    scale: { x: 1, y: 1, z: 1 },
    yOffset: 0,
    collisionRadius: 0.4,
    collisionHeight: 0.3,
    weight: 0.2,
  },
  pole: {
    scale: { x: 3.75, y: 3.75, z: 3.75 },
    yOffset: 4,
    collisionRadius: 0.3,
    collisionSegments: [
      { height: 3, radius: 0.3, yOffset: 0 },
      { height: 1, radius: 0.3, yOffset: 2.5 },
    ],
    weight: 0.1,
  },
} as const;

interface Obstacle {
  type: keyof typeof OBSTACLES;
  position: THREE.Vector3;
  id: number;
}

function checkCollision(playerPosition: THREE.Vector3, obstacle: Obstacle): boolean {
  const config = OBSTACLES[obstacle.type];
  const obstaclePosition = obstacle.position;

  const playerWidth = 1.2;
  const playerDepth = 1.0;
  const playerHeight = 6.0;

  const playerMin = new THREE.Vector3(
    playerPosition.x - playerWidth / 2,
    playerPosition.y -3,
    playerPosition.z - playerDepth / 2
  );
  const playerMax = new THREE.Vector3(
    playerPosition.x + playerWidth / 2,
    playerPosition.y + playerHeight - 4,
    playerPosition.z + playerDepth / 2
  );

  const obstacleRadius = config.collisionRadius * config.scale.x;
  const obstacleHeight = (config.collisionHeight || 2) * config.scale.y;
  
  const obstacleMin = new THREE.Vector3(
    obstaclePosition.x - obstacleRadius,
    obstaclePosition.y,
    obstaclePosition.z - obstacleRadius
  );
  const obstacleMax = new THREE.Vector3(
    obstaclePosition.x + obstacleRadius,
    obstaclePosition.y + obstacleHeight,
    obstaclePosition.z + obstacleRadius
  );

  return (
    playerMax.x >= obstacleMin.x &&
    playerMin.x <= obstacleMax.x &&
    playerMax.y >= obstacleMin.y &&
    playerMin.y <= obstacleMax.y &&
    playerMax.z >= obstacleMin.z &&
    playerMin.z <= obstacleMax.z
  );
}

function Snow() {
  const count = 5000;
  const [positions, setPositions] = useState(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 1] = Math.random() * 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }
    return positions;
  });

  useFrame((state, delta) => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = positions[i3];
      positions[i3 + 1] = positions[i3 + 1] - delta * 10;
      positions[i3 + 2] = positions[i3 + 2] - delta * 5;

      if (positions[i3 + 1] < -5) {
        positions[i3] = (Math.random() - 0.5) * 100;
        positions[i3 + 1] = 50;
        positions[i3 + 2] = (Math.random() - 0.5) * 100;
      }

      if (Math.abs(positions[i3]) > 50) {
        positions[i3] = -positions[i3];
      }
      if (Math.abs(positions[i3 + 2]) > 50) {
        positions[i3 + 2] = -positions[i3 + 2];
      }
    }
    setPositions(positions);
  });

  return (
    <Points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        color="#ffffff"
        sizeAttenuation
        transparent={true}
        opacity={0.8}
      />
    </Points>
  );
}

function Obstacle({ type, position }: { type: keyof typeof OBSTACLES; position: THREE.Vector3 }) {
  const config = OBSTACLES[type];
  
  const obstacleRadius = config.collisionRadius * config.scale.x;
  const obstacleHeight = (config.collisionHeight || 2) * config.scale.y;
  
  const obstacleMin = new THREE.Vector3(
    position.x - obstacleRadius,
    position.y,
    position.z - obstacleRadius
  );
  const obstacleMax = new THREE.Vector3(
    position.x + obstacleRadius,
    position.y + obstacleHeight,
    position.z + obstacleRadius
  );
  
  if (type === 'tree' || type === 'rock' || type === 'pole') {
    const { scene } = useGLTF(MODEL_URLS[type]);
    const clonedScene = useMemo(() => {
      const clone = scene.clone();
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = child.material.clone();
          child.material.toneMapped = false;
          child.material.roughness = 0.8;
          child.material.metalness = 0;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      return clone;
    }, [scene]);

    return (
      <primitive 
        object={clonedScene}
        position={[position.x, position.y + config.yOffset, position.z]}
        scale={[config.scale.x, config.scale.y, config.scale.z]}
      />
    );
  }
  
  return (
    <mesh 
      position={[position.x, position.y + config.yOffset, position.z]}
      scale={[config.scale.x, config.scale.y, config.scale.z]}
    >
      {type === 'bump' && <sphereGeometry args={[0.5, 8, 8]} />}
      <meshStandardMaterial 
        color={type === 'bump' ? '#ffffff' : '#cc0000'}
        roughness={0.8}
        metalness={0}
      />
    </mesh>
  );
}

function Terrain({ playerZ, obstacles, setObstacles }: { 
  playerZ: number;
  obstacles: Obstacle[];
  setObstacles: React.Dispatch<React.SetStateAction<Obstacle[]>>;
}) {
  const segmentLength = 200;
  const visibleSegments = useRef<number[]>([]);
  const lastCleanup = useRef(playerZ);
  
  const generateSegment = (segmentIndex: number) => {
    const startZ = segmentIndex * segmentLength;
    const endZ = startZ + segmentLength;
    return generateObstaclesForSegment(startZ, endZ);
  };

  useEffect(() => {
    const initialSegments: Obstacle[] = [];
    for (let i = -2; i < 3; i++) {
      initialSegments.push(...generateSegment(i));
      visibleSegments.current.push(i);
    }
    setObstacles(initialSegments);
  }, [setObstacles]);

  useFrame(() => {
    const currentSegment = Math.floor(playerZ / segmentLength);
    
    const segmentsToGenerate = [];
    for (let i = currentSegment - 1; i <= currentSegment + 3; i++) {
      if (!visibleSegments.current.includes(i)) {
        segmentsToGenerate.push(i);
        visibleSegments.current.push(i);
      }
    }

    if (segmentsToGenerate.length > 0) {
      const newObstacles = segmentsToGenerate.flatMap(generateSegment);
      setObstacles((prev: Obstacle[]) => [...prev, ...newObstacles]);
    }

    if (Math.abs(playerZ - lastCleanup.current) > segmentLength) {
      const cleanupThreshold = currentSegment - 2;
      setObstacles((prev: Obstacle[]) => 
        prev.filter((obs: Obstacle) => Math.floor(obs.position.z / segmentLength) >= cleanupThreshold)
      );
      visibleSegments.current = visibleSegments.current.filter(
        segment => segment >= cleanupThreshold
      );
      lastCleanup.current = playerZ;
    }
  });

  return (
    <>
      {/* Snow surface */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -1, playerZ + 500]}
        receiveShadow
      >
        <planeGeometry args={[200, 1200, 40, 100]} />
        <meshStandardMaterial 
          color="#ffffff" 
          roughness={0.9}
          metalness={0.1}
          emissive="#f0f8ff"
          emissiveIntensity={0.05}
          onBeforeCompile={(shader) => {
            // Add vertex displacement for subtle snow undulation
            shader.vertexShader = shader.vertexShader.replace(
              '#include <common>',
              `
              #include <common>
              float noise(vec2 p) {
                return sin(p.x * 10.0) * sin(p.y * 10.0) * 0.5 + 0.5;
              }
              `
            );
            shader.vertexShader = shader.vertexShader.replace(
              '#include <begin_vertex>',
              `
              #include <begin_vertex>
              float snowHeight = noise(position.xz * 0.05) * 0.5;
              transformed.y += snowHeight;
              `
            );
          }}
        />
      </mesh>

      {obstacles.map(obstacle => (
        <Obstacle 
          key={obstacle.id}
          type={obstacle.type}
          position={obstacle.position}
        />
      ))}
    </>
  );
}

function generateObstaclesForSegment(startZ: number, endZ: number): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const obstacleTypes = Object.keys(OBSTACLES) as (keyof typeof OBSTACLES)[];
  const density = 0.15;
  const stepSize = 15;
  
  for (let z = startZ; z < endZ; z += stepSize) {
    for (let x = -45; x < 45; x += 8) {
      if (Math.random() < density) {
        const random = Math.random();
        let cumulativeWeight = 0;
        let selectedType = obstacleTypes[0];
        
        for (const type of obstacleTypes) {
          cumulativeWeight += OBSTACLES[type].weight;
          if (random < cumulativeWeight) {
            selectedType = type;
            break;
          }
        }

        obstacles.push({
          type: selectedType,
          position: new THREE.Vector3(
            x + (Math.random() * 6 - 3),
            0,
            z + (Math.random() * 6 - 3)
          ),
          id: Math.random(),
        });
      }
    }
  }
  
  return obstacles;
}

const Player = forwardRef<THREE.Group, { crashed: boolean; onCrashComplete?: () => void }>((props, ref) => {
  const [playerState, setPlayerState] = useState<'idle' | 'left' | 'right' | 'crash'>('idle');
  const rotation = useAnimations(props.crashed ? 'crash' : playerState, props.onCrashComplete);
  const { scene } = useGLTF(MODEL_URLS.skier);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!props.crashed) {
        switch (e.key) {
          case 'ArrowLeft':
          case 'a':
            setPlayerState('left');
            break;
          case 'ArrowRight':
          case 'd':
            setPlayerState('right');
            break;
        }
      }
    };

    const handleKeyUp = () => {
      if (!props.crashed) {
        setPlayerState('idle');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [props.crashed]);

  return (
    <group ref={ref} position={[0, 2, 0]} rotation={[rotation.x, rotation.y + Math.PI, rotation.z]}>
      <primitive object={scene.clone()} scale={[2, 2, 2]} />
    </group>
  );
});

function GameScene({ 
  setScore, 
  setSpeed, 
  setGameOver, 
  speed, 
  gameOver,
  onCrashComplete
}: { 
  setScore: (cb: (prev: number) => number) => void;
  setSpeed: (cb: (prev: number) => number) => void;
  setGameOver: (value: boolean) => void;
  speed: number;
  gameOver: boolean;
  onCrashComplete: () => void;
}) {
  const playerRef = useRef<THREE.Group>(null);
  const playerPosition = useRef({ x: 0, z: 0 });
  const keysPressed = useRef<Set<string>>(new Set());
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);

  useFrame(({ gl, scene, camera }, delta) => {
    if (!playerRef.current || gameOver) return;

    scene.background = new THREE.Color('#ffffff');
    scene.fog = new THREE.FogExp2('#ffffff', 0.004);

    const moveSpeed = 8 * delta;
    if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('a')) {
      playerPosition.current.x = Math.max(playerPosition.current.x - moveSpeed, -10);
      playerRef.current.position.x = playerPosition.current.x;
    }
    if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('d')) {
      playerPosition.current.x = Math.min(playerPosition.current.x + moveSpeed, 10);
      playerRef.current.position.x = playerPosition.current.x;
    }

    const forwardSpeed = 0.3;
    playerRef.current.position.z -= speed * forwardSpeed;
    playerPosition.current.z = playerRef.current.position.z;

    const playerWorldPos = new THREE.Vector3(
      playerRef.current.position.x,
      playerRef.current.position.y,
      playerRef.current.position.z
    );
    
    for (const obstacle of obstacles) {
      if (checkCollision(playerWorldPos, obstacle)) {
        setGameOver(true);
        break;
      }
    }

    camera.position.z = playerRef.current.position.z + 20;
    camera.position.y = 10;
    camera.lookAt(playerRef.current.position);

    if (!gameOver) {
      setScore(prev => prev + speed * delta);
      setSpeed(prev => Math.min(prev + delta * 0.05, 5));
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!playerRef.current || gameOver) return;
      keysPressed.current.add(e.key);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      keysPressed.current.clear();
    };
  }, [gameOver]);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 10, 20]} />
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={0.6} />
      <directionalLight 
        position={[5, 5, 5]} 
        intensity={0.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      
      <Snow />
      <Player ref={playerRef} crashed={gameOver} onCrashComplete={onCrashComplete} />
      <Terrain 
        playerZ={playerPosition.current.z}
        obstacles={obstacles}
        setObstacles={setObstacles}
      />
    </>
  );
}

function Game() {
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    if (gameOver) return;

    const interval = setInterval(() => {
      setTime(prev => prev + 0.1);
    }, 100);

    return () => clearInterval(interval);
  }, [gameOver]);

  const handleRestart = () => {
    window.location.reload();
  };

  const handleCrashComplete = () => {
    setShowLeaderboard(true);
  };

  return (
    <div className="w-full h-screen relative">
      <div className="absolute top-0 left-0 p-4 text-white z-10">
        <div className="bg-black/50 p-2 rounded">
          <p>Score: {Math.floor(score)}</p>
          <p>Speed: {speed.toFixed(1)}x</p>
          <p>Time: {Math.floor(time)}s</p>
        </div>
      </div>
      
      <Canvas
        shadows
        gl={{ 
          antialias: true,
          alpha: false,
          setClearColor: ['#ffffff', 1],
        }}
        camera={{ fov: 75, near: 0.1, far: 1000 }}
      >
        <GameScene 
          setScore={setScore}
          setSpeed={setSpeed}
          setGameOver={setGameOver}
          speed={speed}
          gameOver={gameOver}
          onCrashComplete={handleCrashComplete}
        />
      </Canvas>

      <Leaderboard
        isVisible={showLeaderboard}
        currentScore={score}
        currentTime={time}
        onRestart={handleRestart}
      />
    </div>
  );
}

export default Game;