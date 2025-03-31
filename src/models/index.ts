import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// GLB model URLs
export const MODEL_URLS = {
  tree: 'https://raw.githubusercontent.com/MetaverseMorgan/glbfiles/main/tree.glb',
  skier: 'https://raw.githubusercontent.com/MetaverseMorgan/glbfiles/main/skier.glb',
  rock: 'https://raw.githubusercontent.com/MetaverseMorgan/glbfiles/main/rock.glb',
  pole: 'https://raw.githubusercontent.com/MetaverseMorgan/glbfiles/main/pole.glb',
  yeti: '/snow-yeti.glb'
} as const;

// Preload models with error handling
Object.entries(MODEL_URLS).forEach(([key, url]) => {
  try {
    console.log(`Preloading model: ${key} from ${url}`);
    useGLTF.preload(url);
  } catch (error) {
    console.error(`Failed to preload model: ${key} from ${url}`, error);
  }
});

const createPlaceholderPole = () => {
  const geometry = new THREE.CylinderGeometry(0.1, 0.1, 3, 8);
  const material = new THREE.MeshStandardMaterial({ 
    color: '#cc0000',
    roughness: 0.7,
    metalness: 0.3
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const createPlaceholderBump = () => {
  const geometry = new THREE.SphereGeometry(0.5, 8, 8);
  geometry.scale(1, 0.3, 1);
  const material = new THREE.MeshStandardMaterial({ 
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0.1
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

// Create and cache geometric models
const geometricModels = {
  pole: createPlaceholderPole(),
  bump: createPlaceholderBump(),
};

export function getGeometricModel(type: keyof typeof geometricModels) {
  return geometricModels[type].clone();
}