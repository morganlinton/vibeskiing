import React, { useEffect, useRef, useState, forwardRef, useMemo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { PerspectiveCamera, useGLTF, Points } from '@react-three/drei';
import * as THREE from 'three';
import { MODEL_URLS } from '../models';
import Leaderboard from './Leaderboard';

// Define CollisionBox component for debugging
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
    yOffset: 2,
    collisionRadius: 0.3,
    collisionHeight: 2,
    weight: 0.4,
    color: '#964B00',
  },
  rock: {
    scale: { x: 2, y: 2, z: 2 },
    yOffset: -1.5,
    collisionRadius: 1.0,
    collisionHeight: 1.5,
    weight: 0.3,
    color: '#808080',
  },
  bump: {
    scale: { x: 1, y: 1, z: 1 },
    yOffset: -2.85,
    collisionRadius: 0.4,
    collisionHeight: 0.3,
    weight: 0.2,
    color: '#ffffff',
  },
  pole: {
    scale: { x: 3.75, y: 3.75, z: 3.75 },
    yOffset: 1,
    collisionRadius: 0.3,
    collisionSegments: [
      { height: 3, radius: 0.3, yOffset: 0 },
      { height: 1, radius: 0.3, yOffset: 2.5 },
    ],
    weight: 0.1,
    color: '#808080',
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
    playerPosition.y - 3, // Changed from -4 to -3
    playerPosition.z - playerDepth / 2
  );
  const playerMax = new THREE.Vector3(
    playerPosition.x + playerWidth / 2,
    playerPosition.y + playerHeight - 2, // Changed from -4 to -2
    playerPosition.z + playerDepth / 2
  );

  // Check if object has collisionSegments (for poles)
  if ('collisionSegments' in config) {
    // For poles with segments
    for (const segment of config.collisionSegments) {
      const obstacleRadius = segment.radius * config.scale.x;
      const obstacleHeight = segment.height * config.scale.y;
      const obstacleMin = new THREE.Vector3(
        obstaclePosition.x - obstacleRadius,
        obstaclePosition.y + segment.yOffset,
        obstaclePosition.z - obstacleRadius
      );
      const obstacleMax = new THREE.Vector3(
        obstaclePosition.x + obstacleRadius,
        obstaclePosition.y + segment.yOffset + obstacleHeight,
        obstaclePosition.z + obstacleRadius
      );

      if (
        playerMax.x >= obstacleMin.x &&
        playerMin.x <= obstacleMax.x &&
        playerMax.y >= obstacleMin.y &&
        playerMin.y <= obstacleMax.y &&
        playerMax.z >= obstacleMin.z &&
        playerMin.z <= obstacleMax.z
      ) {
        return true;
      }
    }
    return false;
  } 
  
  // For regular obstacles with collisionHeight
  const obstacleRadius = config.collisionRadius * config.scale.x;
  // Type safe access to collisionHeight with a fallback
  const obstacleHeight = ('collisionHeight' in config ? config.collisionHeight : 2) * config.scale.y;
  
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
  const [positions] = useState(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 1] = Math.random() * 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }
    return positions;
  });

  const positionsRef = useRef(positions);
  
  useFrame((state, delta) => {
    const positions = positionsRef.current;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Keep x position
      // Move snow downward (y)
      positions[i3 + 1] = positions[i3 + 1] - delta * 10;
      // Move snow forward (z)
      positions[i3 + 2] = positions[i3 + 2] - delta * 5;

      // Reset snow particles that go out of bounds
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
  });

  return (
    <Points limit={count}>
      <pointsMaterial size={0.3} color="#ffffff" sizeAttenuation transparent opacity={0.8} />
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positionsRef.current}
          itemSize={3}
          usage={THREE.DynamicDrawUsage}
        />
      </bufferGeometry>
    </Points>
  );
}

function Obstacle({ type, position }: { type: keyof typeof OBSTACLES; position: THREE.Vector3 }) {
  const config = OBSTACLES[type];

  // Use the original position directly, no need to raise it
  const adjustedPosition = position; // Removed the y + 1 adjustment

  if (type === 'tree' || type === 'rock' || type === 'pole') {
    const { scene } = useGLTF(MODEL_URLS[type]);

    const clonedScene = useMemo(() => {
      const clone = scene.clone();
      clone.traverse((child: THREE.Object3D) => {
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
        // Use adjustedPosition.y directly with the new yOffset
        position={[adjustedPosition.x, adjustedPosition.y + config.yOffset, adjustedPosition.z]}
        scale={[config.scale.x, config.scale.y, config.scale.z]}
        castShadow
        receiveShadow
      />
    );
  }

  return (
    <mesh
      // Use adjustedPosition.y directly with the new yOffset
      position={[adjustedPosition.x, adjustedPosition.y + config.yOffset, adjustedPosition.z]}
      scale={[config.scale.x, config.scale.y, config.scale.z]}
      castShadow
      receiveShadow
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

function Terrain({ 
  playerZ, 
  obstacles,
  setObstacles 
}: { 
  playerZ: number;
  obstacles: Obstacle[];
  setObstacles: React.Dispatch<React.SetStateAction<Obstacle[]>>;
}) {
  const segmentLength = 200;
  const visibleSegments = useRef<number[]>([]);
  const lastCleanup = useRef(playerZ);
  
  // Load the snow texture
  const snowTexture = useLoader(THREE.TextureLoader, '/snow-texture.png'); // Assuming the texture is in the public folder

  // Configure texture wrapping and repetition
  useEffect(() => {
    if (snowTexture) {
      snowTexture.wrapS = THREE.RepeatWrapping;
      snowTexture.wrapT = THREE.RepeatWrapping;
      // Adjust repeat values as needed for desired tiling effect
      snowTexture.repeat.set(20, 200); // Example: repeat 20 times horizontally, 200 times vertically per plane segment
    }
  }, [snowTexture]);

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

  // Create multiple ground planes that move with the player
  const groundPlanes = [];
  const planeSize = 1000; // Size of each ground plane segment
  const visibleDistance = 3000; // How far ahead the player can see
  
  // Create multiple ground planes extending forward
  for (let z = Math.floor(playerZ / planeSize) * planeSize; z > playerZ - 1000; z -= planeSize) {
    groundPlanes.push(
      <mesh 
        key={`ground-behind-${z}`}
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -3, z]}
        receiveShadow
      >
        <planeGeometry args={[100, planeSize]} />
        <meshStandardMaterial 
          color="#ffffff" 
          roughness={0.9}
          map={snowTexture}
        />
      </mesh>
    );
  }
  
  for (let z = Math.floor(playerZ / planeSize) * planeSize; z < playerZ + visibleDistance; z += planeSize) {
    groundPlanes.push(
      <mesh 
        key={`ground-ahead-${z}`}
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -3, z]}
        receiveShadow
      >
        <planeGeometry args={[100, planeSize]} />
        <meshStandardMaterial 
          color="#ffffff" 
          roughness={0.9}
          map={snowTexture}
        />
      </mesh>
    );
  }

  return (
    <>
      {/* Infinite ground planes */}
      {groundPlanes}

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

const Player = forwardRef<THREE.Group, { crashed: boolean; onCrashComplete: () => void }>(
  ({ crashed, onCrashComplete }, ref) => {
    // Don't use the 3D model yet, as it's causing issues
    const [rotation, setRotation] = useState(0);
    const crashRotation = useRef({ x: 0, y: 0, z: 0 });
    const crashAnimationCompleted = useRef(false);

    // Add keyboard controls
    useEffect(() => {
      const group = ref as React.MutableRefObject<THREE.Group>;
      if (!group.current) return;
      
      group.current.userData = {
        leftPressed: false,
        rightPressed: false,
        lastTime: 0
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (crashed) return;
        
        if (e.key === 'ArrowLeft' || e.key === 'a') {
          group.current.userData.leftPressed = true;
          setRotation(0.4);
        } else if (e.key === 'ArrowRight' || e.key === 'd') {
          group.current.userData.rightPressed = true;
          setRotation(-0.4);
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft' || e.key === 'a') {
          group.current.userData.leftPressed = false;
          if (!group.current.userData.rightPressed) setRotation(0);
        } else if (e.key === 'ArrowRight' || e.key === 'd') {
          group.current.userData.rightPressed = false;
          if (!group.current.userData.leftPressed) setRotation(0);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }, [ref, crashed]);

    useFrame((_: any, delta: number) => {
      if (!ref || !crashed || crashAnimationCompleted.current) return;

      // Crash animation
      const group = ref as React.MutableRefObject<THREE.Group>;
      
      if (crashRotation.current.z < Math.PI * 2) {
        crashRotation.current.z += delta * 5;
        crashRotation.current.x += delta * 2;
        group.current.rotation.z = crashRotation.current.z;
        group.current.rotation.x = crashRotation.current.x;
      } else {
        crashAnimationCompleted.current = true;
        onCrashComplete();
      }
    });

    return (
      <group 
        ref={ref} 
        position={[0, 0, 0]} 
        rotation={[0, 0, rotation]}
      >
        {/* Use a simple red box that we know works */}
        <mesh position={[0, 2, 0]} castShadow>
          <boxGeometry args={[1, 3, 1]} />
          <meshStandardMaterial color="#FF0000" />
        </mesh>
      </group>
    );
  }
);

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
  const [playerPosition] = useState(new THREE.Vector3(0, 2, 0));
  const playerRef = useRef<THREE.Group>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const [crashed, setCrashed] = useState(false);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const clock = useRef(new THREE.Clock()).current;
  const [showCollisionBox, setShowCollisionBox] = useState(false);
  
  useEffect(() => {
    if (gameOver) {
      setCrashed(true);
    }

    // Add key listener for toggling collision box visibility
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'c') {
        setShowCollisionBox(prev => !prev);
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [gameOver]);

  useFrame(() => {
    if (crashed || !playerRef.current) return;
    
    const deltaTime = Math.min(clock.getElapsedTime() - (playerRef.current.userData.lastTime || 0), 0.1);
    playerRef.current.userData.lastTime = clock.getElapsedTime();
    
    // Calculate forward movement
    const movementSpeed = 10 * speed;
    
    // Move forward
    playerPosition.z -= movementSpeed * deltaTime;
    
    // Calculate lateral movement based on keyboard input
    const leftKey = playerRef.current.userData.leftPressed;
    const rightKey = playerRef.current.userData.rightPressed;
    
    const lateralSpeed = 5;
    
    if (leftKey) {
      playerPosition.x -= lateralSpeed * deltaTime;
    } else if (rightKey) {
      playerPosition.x += lateralSpeed * deltaTime;
    }
    
    // Keep the player within bounds
    const boundaryX = 10;
    playerPosition.x = Math.max(-boundaryX, Math.min(boundaryX, playerPosition.x));
    
    // Update player position
    playerRef.current.position.copy(playerPosition);
    
    // Update camera position to follow player
    if (cameraRef.current) {
      cameraRef.current.position.x = playerPosition.x * 0.3; // Follow with slight lag
      cameraRef.current.position.z = playerPosition.z + 15; // Stay behind player
      cameraRef.current.lookAt(playerPosition.x, playerPosition.y, playerPosition.z);
    }
    
    // Check for collisions
    for (const obstacle of obstacles) {
      if (checkCollision(playerPosition, obstacle)) {
        setGameOver(true);
        return;
      }
    }
    
    // Update score and speed
    setScore(prev => prev + deltaTime * 10 * speed);
    setSpeed(prev => Math.min(3, prev + deltaTime * 0.01));
  });

  return (
    <>
      <PerspectiveCamera 
        ref={cameraRef}
        makeDefault
        position={[0, 8, 15]} 
        fov={75}
        near={0.1}
        far={1000}
      />
      
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 15, 5]} intensity={1} castShadow />
      <hemisphereLight args={['#ffffff', '#77bbff', 1]} />
      
      {/* Display collision box if debug mode is enabled */}
      {showCollisionBox && (
        <CollisionBox 
          min={new THREE.Vector3(
            playerPosition.x - 1.2 / 2,
            playerPosition.y - 3, // User's preferred min y value
            playerPosition.z - 1.0 / 2
          )} 
          max={new THREE.Vector3(
            playerPosition.x + 1.2 / 2,
            playerPosition.y - 2, // User's preferred max y value
            playerPosition.z + 1.0 / 2
          )} 
          color="blue"
        />
      )}
      
      {/* The player */}
      <Player 
        ref={playerRef} 
        crashed={crashed} 
        onCrashComplete={onCrashComplete}
      />
      
      {/* Snow particles */}
      <Snow />
      
      {/* Terrain and obstacles */}
      <Terrain 
        playerZ={playerPosition.z}
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
      
      <Canvas style={{ background: "#87CEEB" }}>
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