import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

// Generate a consistent color for each player based on their ID
function getPlayerColor(playerId) {
  const colors = [
    '#FF6B6B', // Red
    '#4ECDC4', // Cyan
    '#45B7D1', // Blue
    '#FFA07A', // Orange
    '#98D8C8', // Mint
    '#F7DC6F', // Yellow
    '#BB8FCE', // Purple
    '#85C1E2', // Light Blue
  ];

  // Use player ID to deterministically pick a color
  const hash = playerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

/**
 * Component to render other players in the game with a voxel character model
 * @param {Object} props
 * @param {string} props.playerId - Player ID
 * @param {string} props.username - Player username
 * @param {Object} props.position - Target position {x, y, z}
 * @param {Object} props.rotation - Player rotation {x, y}
 */
export default function OtherPlayer({ playerId, username, position, rotation }) {
  const groupRef = useRef();
  const targetPosition = useRef(new THREE.Vector3(position.x, position.y, position.z));
  const currentPosition = useRef(new THREE.Vector3(position.x, position.y, position.z));
  const playerColor = useMemo(() => getPlayerColor(playerId), [playerId]);

  // Update target position when prop changes
  useFrame(() => {
    if (!groupRef.current) return;

    // Update target
    targetPosition.current.set(position.x, position.y, position.z);

    // Smooth interpolation (lerp) between current and target position
    currentPosition.current.lerp(targetPosition.current, 0.15);

    // Apply to mesh
    groupRef.current.position.copy(currentPosition.current);

    // Apply rotation if provided
    if (rotation) {
      groupRef.current.rotation.y = rotation.y || 0;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Head */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color={playerColor} />
      </mesh>

      {/* Body */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[0.6, 0.9, 0.4]} />
        <meshStandardMaterial color={playerColor} />
      </mesh>

      {/* Left Arm */}
      <mesh position={[-0.45, 0.75, 0]} castShadow>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshStandardMaterial color={playerColor} />
      </mesh>

      {/* Right Arm */}
      <mesh position={[0.45, 0.75, 0]} castShadow>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshStandardMaterial color={playerColor} />
      </mesh>

      {/* Left Leg */}
      <mesh position={[-0.2, 0.0, 0]} castShadow>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshStandardMaterial color={playerColor} />
      </mesh>

      {/* Right Leg */}
      <mesh position={[0.2, 0.0, 0]} castShadow>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshStandardMaterial color={playerColor} />
      </mesh>

      {/* Username label above player */}
      <Text
        position={[0, 2.2, 0]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="black"
      >
        {username}
      </Text>
    </group>
  );
}
