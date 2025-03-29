import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { usePlane } from '@react-three/cannon';
import { type Obstacle, OBSTACLES, generateObstaclesForSegment, PhysicsObstacle, COLLISION_GROUPS } from './Game';

interface TerrainProps {
  position: THREE.Vector3;
  playerZ: number;
}

function Terrain({ position, playerZ }: TerrainProps) {
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const segmentLength = 200;
  const visibleSegments = useRef<number[]>([]);
  const lastCleanup = useRef(playerZ);

  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 4, 0, 0],
    position: [position.x, position.y, position.z],
    type: "Static",
    collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
    collisionFilterMask: COLLISION_GROUPS.PLAYER
  }));

  useEffect(() => {
    const initialSegments: Obstacle[] = [];
    for (let i = -2; i < 3; i++) {
      initialSegments.push(...generateObstaclesForSegment(i * segmentLength, (i + 1) * segmentLength));
      visibleSegments.current.push(i);
    }
    setObstacles(initialSegments);
  }, []);

  useEffect(() => {
    if (playerZ === 0) return;

    const currentSegment = Math.floor(playerZ / segmentLength);
    
    const segmentsToGenerate = [];
    for (let i = currentSegment - 1; i <= currentSegment + 3; i++) {
      if (!visibleSegments.current.includes(i)) {
        segmentsToGenerate.push(i);
        visibleSegments.current.push(i);
      }
    }

    if (segmentsToGenerate.length > 0) {
      const newObstacles = segmentsToGenerate.flatMap(segment => 
        generateObstaclesForSegment(segment * segmentLength, (segment + 1) * segmentLength)
      );
      setObstacles(prev => [...prev, ...newObstacles]);
    }

    if (Math.abs(playerZ - lastCleanup.current) > segmentLength) {
      const cleanupThreshold = currentSegment - 2;
      setObstacles(prev => 
        prev.filter(obs => Math.floor(obs.position.z / segmentLength) >= cleanupThreshold)
      );
      visibleSegments.current = visibleSegments.current.filter(
        segment => segment >= cleanupThreshold
      );
      lastCleanup.current = playerZ;
    }
  }, [playerZ]);

  const terrainGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(100, 1000, 50, 100);
    const vertices = geometry.attributes.position.array;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      vertices[i + 1] = Math.sin(x * 0.05) * 0.5 + Math.cos(z * 0.05) * 0.5;
    }
    
    return geometry;
  }, []);

  return (
    <>
      <mesh ref={ref} receiveShadow>
        <primitive object={terrainGeometry} />
        <meshStandardMaterial 
          color="#ffffff"
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>
      
      {obstacles.map(obstacle => (
        <PhysicsObstacle 
          key={obstacle.id}
          type={obstacle.type}
          position={obstacle.position}
        />
      ))}
    </>
  );
}

export default Terrain;