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
      <meshBasicMaterial color={color} wireframe={true} depthTest={false} />
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

// --- Define Yeti Properties ---
const BASE_YETI_SPEED = 36; // Speed when player speed is 1
const BASE_YETI_SPAWN_DISTANCE = 18; // Distance when player speed is 1
const BASE_YETI_SPAWN_CHANCE = 0.5; // Base chance per second

const YETI_STATIC_CONFIG = { // Renamed to hold non-dynamic properties
  scale: { x: 6, y: 6, z: 6 },
  yOffset: 1,
  collisionWidth: 2.5, // Might need adjustment based on scaled model
  collisionHeight: 5, // Might need adjustment based on scaled model
  collisionDepth: 2, // Might need adjustment based on scaled model
  boundsX: 60, // Horizontal limit before despawning (kept static for now)
};
// --- End Yeti Properties ---

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

// --- Add Yeti Collision Check Function ---
function checkYetiCollision(
  playerPosition: THREE.Vector3,
  yetiPosition: THREE.Vector3 | null
): boolean {
  if (!yetiPosition) return false;

  // Player collision box dimensions (match the ones used in GameScene)
  const playerWidth = 1.2;
  const playerDepth = 1.0;
  const playerHeight = 6.0;
  const playerBaseOffsetY = -3; // Base Y offset used in checkCollision logic
  const playerCollisionMinY = playerPosition.y + playerBaseOffsetY;
  const playerCollisionMaxY = playerPosition.y + playerHeight - 2;

  const playerMin = new THREE.Vector3(
    playerPosition.x - playerWidth / 2,
    playerCollisionMinY,
    playerPosition.z - playerDepth / 2
  );
  const playerMax = new THREE.Vector3(
    playerPosition.x + playerWidth / 2,
    playerCollisionMaxY,
    playerPosition.z + playerDepth / 2
  );

  // Yeti collision box dimensions - Use YETI_STATIC_CONFIG
  const yetiWidth = YETI_STATIC_CONFIG.collisionWidth; // Use static config
  const yetiHeight = YETI_STATIC_CONFIG.collisionHeight; // Use static config
  const yetiDepth = YETI_STATIC_CONFIG.collisionDepth; // Use static config
  const yetiBaseY = YETI_STATIC_CONFIG.yOffset; // Use static config

  const yetiMin = new THREE.Vector3(
    yetiPosition.x - yetiWidth / 2,
    yetiPosition.y + yetiBaseY,
    yetiPosition.z - yetiDepth / 2
  );
  const yetiMax = new THREE.Vector3(
    yetiPosition.x + yetiWidth / 2,
    yetiPosition.y + yetiBaseY + yetiHeight,
    yetiPosition.z + yetiDepth / 2
  );

  // Simple AABB collision check
  return (
    playerMax.x >= yetiMin.x &&
    playerMin.x <= yetiMax.x &&
    playerMax.y >= yetiMin.y &&
    playerMin.y <= yetiMax.y &&
    playerMax.z >= yetiMin.z &&
    playerMin.z <= yetiMax.z
  );
}
// --- End Yeti Collision Check ---

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

// --- Add Yeti Component ---
function Yeti({ position }: { position: THREE.Vector3 }) {
  const { scene } = useGLTF(MODEL_URLS.yeti);

  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.material = child.material.clone();
        child.material.toneMapped = false;
        // Optional: Tint the yeti blueish?
        // if (child.material instanceof THREE.MeshStandardMaterial) {
        //   child.material.color.set('#a0c0ff');
        // }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  return (
    <primitive
      object={clonedScene}
      position={[position.x, position.y + YETI_STATIC_CONFIG.yOffset, position.z]} // Use static config
      scale={[YETI_STATIC_CONFIG.scale.x, YETI_STATIC_CONFIG.scale.y, YETI_STATIC_CONFIG.scale.z]} // Use static config
      // Rotate yeti to face sideways if needed (adjust Y rotation)
      // rotation={[0, Math.PI / 2, 0]}
      castShadow
      receiveShadow
    />
  );
}
// --- End Yeti Component ---

function Terrain({
  playerZ,
  obstacles,
  setObstacles,
  showCollisionBox
}: {
  playerZ: number;
  obstacles: Obstacle[];
  setObstacles: React.Dispatch<React.SetStateAction<Obstacle[]>>;
  showCollisionBox: boolean;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Add a counter to limit logging
  let logCount = 0;
  const maxLogs = 2; // Log bounds for the first few obstacles only

  return (
    <>
      {/* Infinite ground planes */}
      {groundPlanes}

      {/* Render obstacles and their collision boxes */}
      {obstacles.map(obstacle => {
        const config = OBSTACLES[obstacle.type];
        const obstaclePosition = obstacle.position;
        const visualYOffset = config.yOffset || 0;

        let collisionBoxes: JSX.Element[] = [];
        if (showCollisionBox) {
          let obstacleMin: THREE.Vector3 | null = null;
          let obstacleMax: THREE.Vector3 | null = null;

          if ('collisionSegments' in config) {
            // For poles with segments
             config.collisionSegments.forEach((segment, index) => {
               const obstacleRadius = segment.radius * config.scale.x;
               const obstacleHeight = segment.height * config.scale.y;
               const segmentBaseY = visualYOffset + segment.yOffset * config.scale.y;
               // Calculate initial segment bounds
               const min = new THREE.Vector3(
                 obstaclePosition.x - obstacleRadius,
                 obstaclePosition.y + segmentBaseY,
                 obstaclePosition.z - obstacleRadius
               );
               const max = new THREE.Vector3(
                 obstaclePosition.x + obstacleRadius,
                 obstaclePosition.y + segmentBaseY + obstacleHeight,
                 obstaclePosition.z + obstacleRadius
               );

               // *** Adjust specific adjustment for pole segments ***
               const poleSegmentYAdjustment = -3; // Changed from -2 to -3 (Move down by 3 total)
               min.y += poleSegmentYAdjustment;
               max.y += poleSegmentYAdjustment;

               // Log pole segment bounds if needed
               if (logCount < maxLogs && index === 0) { // Log only first segment
                 console.log(`Obstacle ${obstacle.id} (${obstacle.type}) Segment ${index} Final Bounds (adj: ${poleSegmentYAdjustment}):`, { min: min, max: max });
                 logCount++;
               }
               collisionBoxes.push(
                 <CollisionBox
                   key={`${obstacle.id}-segment-${index}`}
                   min={min} // Use adjusted min
                   max={max} // Use adjusted max
                   color={config.color || '#FF00FF'}
                 />
               );
             });
          } else {
            // For regular obstacles (tree, rock, bump)
            const obstacleRadius = config.collisionRadius * config.scale.x;
            const obstacleHeight = ('collisionHeight' in config ? config.collisionHeight : 2) * config.scale.y;
            const collisionBaseY = visualYOffset;
            // Calculate initial bounds including visual offset
            obstacleMin = new THREE.Vector3(
              obstaclePosition.x - obstacleRadius,
              obstaclePosition.y + collisionBaseY,
              obstaclePosition.z - obstacleRadius
            );
            obstacleMax = new THREE.Vector3(
              obstaclePosition.x + obstacleRadius,
              obstaclePosition.y + collisionBaseY + obstacleHeight,
              obstaclePosition.z + obstacleRadius
            );

            // *** Adjust specific adjustment for trees ***
            if (obstacle.type === 'tree') {
              const treeYAdjustment = -4; // Move down by 4
              obstacleMin.y += treeYAdjustment;
              obstacleMax.y += treeYAdjustment;
              console.log(`Applied Y adjustment (${treeYAdjustment}) to tree ${obstacle.id}`);
            }
            // *** Add specific adjustment for rocks ***
            else if (obstacle.type === 'rock') {
              const rockYAdjustment = -2; // Move down by 2
              obstacleMin.y += rockYAdjustment;
              obstacleMax.y += rockYAdjustment;
              console.log(`Applied Y adjustment (${rockYAdjustment}) to rock ${obstacle.id}`);
            }

            // Log final bounds
            if (logCount < maxLogs) {
               console.log(`Obstacle ${obstacle.id} (${obstacle.type}) Final Bounds:`, { min: obstacleMin, max: obstacleMax });
               logCount++;
            }

            // Create the collision box with potentially adjusted bounds
            collisionBoxes.push(
              <CollisionBox
                key={`${obstacle.id}-collision`}
                min={obstacleMin} // Use the final min vector
                max={obstacleMax} // Use the final max vector
                color={config.color || '#FF00FF'}
              />
            );
          }
        }

        return (
          <React.Fragment key={obstacle.id}>
            <Obstacle
              type={obstacle.type}
              position={obstacle.position}
            />
            {collisionBoxes}
          </React.Fragment>
        );
      })}
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
    // Load the skier model
    const { scene } = useGLTF(MODEL_URLS.skier);

    // Clone the scene to avoid modifying the original cache and apply material settings
    const clonedScene = useMemo(() => {
      const clone = scene.clone();
      clone.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          child.material = child.material.clone();
          child.material.toneMapped = false; // Adjust material properties as needed
          child.castShadow = true;
          // child.receiveShadow = true; // Skier probably doesn't need to receive shadows
        }
      });
      return clone;
    }, [scene]);

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
        position={[0, 0, 0]} // Keep group at origin, model position adjusted below
        rotation={[0, 0, rotation]} // Apply turning rotation to the group
      >
        {/* Use the loaded GLTF model */}
        <primitive
          object={clonedScene}
          position={[0, -2, 0]} // Changed Y from -3 to -2 to move the player up by 1
          scale={[2.5, 2.5, 2.5]} // Adjust scale as needed
          rotation={[0, Math.PI, 0]} // Rotate 180 degrees if the model faces the wrong way
          castShadow
        />
      </group>
    );
  }
);

// --- Define Yeti State Type ---
interface YetiState {
  active: boolean;
  position: THREE.Vector3 | null;
  direction: 'left' | 'right' | null; // Direction it's moving
  spawnZ: number | null; // Z position where it was spawned
}
// --- End Yeti State Type ---

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

  // --- Add Yeti State ---
  const [yetiState, setYetiState] = useState<YetiState>({
    active: false,
    position: null,
    direction: null,
    spawnZ: null,
  });
  const yetiRef = useRef(new THREE.Vector3()); // Ref for mutable position updates
  // --- End Yeti State ---

  useEffect(() => {
    if (gameOver) {
      setCrashed(true);
    }

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'c') {
        console.log("'c' key pressed, toggling showCollisionBox"); // Log key press
        setShowCollisionBox(prev => {
          console.log("Previous showCollisionBox state:", prev); // Log previous state
          const nextState = !prev;
          console.log("Next showCollisionBox state:", nextState); // Log next state
          return nextState;
        });
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [gameOver]);

  useFrame(() => {
    if (crashed || !playerRef.current) return;
    
    const deltaTime = Math.min(clock.getElapsedTime() - (playerRef.current.userData.lastTime || 0), 0.23);
    playerRef.current.userData.lastTime = clock.getElapsedTime();
    
    // --- Player Movement Logic ---
    const movementSpeed = 10 * speed; // Player forward speed uses the speed prop
    // Move forward
    playerPosition.z -= movementSpeed * deltaTime;
    
    // Calculate lateral movement based on keyboard input
    const leftKey = playerRef.current.userData.leftPressed;
    const rightKey = playerRef.current.userData.rightPressed;
    
    const lateralSpeed = 16;
    
    if (leftKey) {
      playerPosition.x -= lateralSpeed * deltaTime;
    } else if (rightKey) {
      playerPosition.x += lateralSpeed * deltaTime;
    }
    
    // Keep the player within bounds - Use ground plane half-width
    const boundaryX = 50; // Changed from 10 to 50
    playerPosition.x = Math.max(-boundaryX, Math.min(boundaryX, playerPosition.x));
    
    // Update player position
    playerRef.current.position.copy(playerPosition);
    // --- End Player Movement Logic ---

    // --- Yeti Spawning Logic ---
    if (!yetiState.active && !gameOver) {
      // *** Calculate dynamic spawn chance and distance based on player speed ***
      const currentSpawnChance = BASE_YETI_SPAWN_CHANCE * speed; // Higher speed = higher chance
      const currentSpawnDistance = BASE_YETI_SPAWN_DISTANCE * speed; // Higher speed = spawn further away

      // Spawn randomly based on time and calculated chance
      if (Math.random() < currentSpawnChance * deltaTime) {
        const direction = Math.random() < 0.5 ? 'left' : 'right';
        const startX = direction === 'left' ? YETI_STATIC_CONFIG.boundsX : -YETI_STATIC_CONFIG.boundsX;
        // *** Use calculated spawn distance ***
        const spawnZ = playerPosition.z - currentSpawnDistance;
        const startY = 0; // Ground level

        yetiRef.current.set(startX, startY, spawnZ);
        setYetiState({
          active: true,
          position: yetiRef.current.clone(),
          direction: direction,
          spawnZ: spawnZ,
        });
      }
    }
    // --- End Yeti Spawning Logic ---

    // --- Yeti Movement Logic ---
    if (yetiState.active && yetiState.position && yetiState.direction) {
      // *** Calculate dynamic yeti speed based on player speed ***
      const currentYetiSpeed = BASE_YETI_SPEED * speed;

      // *** Use calculated speed for movement ***
      const moveX = currentYetiSpeed * deltaTime * (yetiState.direction === 'left' ? -1 : 1);
      yetiRef.current.x += moveX; // Update the ref

      // Keep Z constant at spawn depth
      yetiRef.current.z = yetiState.spawnZ!;

      // Update state position
      setYetiState(prev => ({ ...prev, position: yetiRef.current.clone() }));

      // Despawn if out of bounds
      if (
        (yetiState.direction === 'left' && yetiRef.current.x < -YETI_STATIC_CONFIG.boundsX) ||
        (yetiState.direction === 'right' && yetiRef.current.x > YETI_STATIC_CONFIG.boundsX)
      ) {
        setYetiState({ active: false, position: null, direction: null, spawnZ: null });
      }
    }
    // --- End Yeti Movement Logic ---

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

    // Check moving yeti (uses yetiRef.current, which has updated position)
    if (yetiState.active && checkYetiCollision(playerPosition, yetiRef.current)) {
       setGameOver(true);
       return; // Stop frame processing on game over
    }
    
    // Update score and player speed (only if not game over)
    setScore(prev => prev + deltaTime * 10 * speed);
    setSpeed(prev => Math.min(3, prev + deltaTime * 0.01));
  });

  // --- Calculate player collision box bounds for visualization ---
  const playerWidth = 1.2;
  const playerDepth = 1.0;
  const playerHeight = 6.0; // Height used in checkCollision logic
  const playerBaseOffsetY = -3; // Base Y offset used in checkCollision logic (relative to playerPosition.y)

  // Calculate the Y bounds that *match* the checkCollision logic
  // checkCollision uses: min.y = playerPosition.y - 3
  //                     max.y = playerPosition.y + playerHeight - 2 = playerPosition.y + 6 - 2 = playerPosition.y + 4
  const logicCollisionMinY = playerPosition.y + playerBaseOffsetY; // Should be playerPosition.y - 3
  const logicCollisionMaxY = playerPosition.y + playerHeight - 2; // Should be playerPosition.y + 4

  // Apply the requested visual adjustment
  const visualPlayerYAdjustment = -2; // Move visual box down by 2

  const visualCollisionMinY = logicCollisionMinY + visualPlayerYAdjustment;
  const visualCollisionMaxY = logicCollisionMaxY + visualPlayerYAdjustment;

  // Final min/max vectors for the visual CollisionBox component
  const playerCollisionMin = new THREE.Vector3(
    playerPosition.x - playerWidth / 2,
    visualCollisionMinY, // Use adjusted Y value
    playerPosition.z - playerDepth / 2
  );
  const playerCollisionMax = new THREE.Vector3(
    playerPosition.x + playerWidth / 2,
    visualCollisionMaxY, // Use adjusted Y value
    playerPosition.z + playerDepth / 2
  );
  // --- End of collision box calculation ---

  // --- Yeti Collision Box Calculation (for visualization) ---
  let yetiCollisionBox = null;
  if (showCollisionBox && yetiState.active && yetiState.position) {
    // *** Use static config for dimensions ***
    const yetiWidth = YETI_STATIC_CONFIG.collisionWidth;
    const yetiHeight = YETI_STATIC_CONFIG.collisionHeight;
    const yetiDepth = YETI_STATIC_CONFIG.collisionDepth;
    const yetiBaseY = YETI_STATIC_CONFIG.yOffset;

    const yetiMin = new THREE.Vector3(
      yetiState.position.x - yetiWidth / 2,
      yetiState.position.y + yetiBaseY,
      yetiState.position.z - yetiDepth / 2
    );
    const yetiMax = new THREE.Vector3(
      yetiState.position.x + yetiWidth / 2,
      yetiState.position.y + yetiBaseY + yetiHeight,
      yetiState.position.z + yetiDepth / 2
    );
    yetiCollisionBox = <CollisionBox min={yetiMin} max={yetiMax} color="red" />;
  }
  // --- End Yeti Collision Box Calculation ---

  // Log player bounds if state is true
  if (showCollisionBox) {
    // Log the bounds being used for the VISUAL box
    console.log("Player Visual Bounds:", { min: playerCollisionMin, max: playerCollisionMax });
  }

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
      
      {/* Display PLAYER collision box if debug mode is enabled */}
      {showCollisionBox && (
        <CollisionBox
          min={playerCollisionMin} // Use the calculated visual bounds
          max={playerCollisionMax} // Use the calculated visual bounds
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
        showCollisionBox={showCollisionBox}
      />

      {/* --- Render Yeti Collision Box --- */}
      {yetiCollisionBox}
      {/* --- End Render Yeti Collision Box --- */}

      {/* --- Render Yeti --- */}
      {yetiState.active && yetiState.position && (
        <Yeti position={yetiState.position} />
      )}
      {/* --- End Render Yeti --- */}
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