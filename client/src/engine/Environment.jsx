import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

/**
 * Environment component - adds clouds, sun, and atmospheric effects
 */
export default function Environment() {
  const cloudsRef = useRef();

  // Generate random cloud positions
  const clouds = useMemo(() => {
    const cloudArray = [];
    for (let i = 0; i < 20; i++) {
      cloudArray.push({
        position: [
          (Math.random() - 0.5) * 200,
          40 + Math.random() * 20,
          (Math.random() - 0.5) * 200
        ],
        scale: 3 + Math.random() * 4,
        rotation: Math.random() * Math.PI
      });
    }
    return cloudArray;
  }, []);

  // Animate clouds slowly drifting
  useFrame((state) => {
    if (cloudsRef.current) {
      cloudsRef.current.children.forEach((cloud, i) => {
        cloud.position.x += 0.01;
        if (cloud.position.x > 100) cloud.position.x = -100;
      });
    }
  });

  return (
    <>
      {/* Sun */}
      <directionalLight
        position={[100, 80, 50]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-near={0.5}
        shadow-camera-far={200}
      />

      {/* Sun visual (bright sphere) */}
      <mesh position={[100, 80, 50]}>
        <sphereGeometry args={[5, 16, 16]} />
        <meshBasicMaterial color="#FFFF00" />
      </mesh>

      {/* Ambient light for overall illumination */}
      <ambientLight intensity={0.7} />

      {/* Hemisphere light for sky-ground color */}
      <hemisphereLight
        color="#87CEEB"  // Sky blue
        groundColor="#8B7355"  // Ground brown
        intensity={0.6}
      />

      {/* Clouds */}
      <group ref={cloudsRef}>
        {clouds.map((cloud, i) => (
          <mesh
            key={i}
            position={cloud.position}
            rotation={[0, cloud.rotation, 0]}
          >
            <sphereGeometry args={[cloud.scale, 8, 8]} />
            <meshStandardMaterial
              color="#FFFFFF"
              transparent
              opacity={0.8}
              roughness={1}
            />
          </mesh>
        ))}
      </group>

      {/* Fog for atmosphere */}
      <fog attach="fog" args={['#87CEEB', 50, 180]} />
    </>
  );
}
