import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import Player from './Player';
import World from './World';
import Chunk from './Chunk';
import OtherPlayer from './OtherPlayer';
import BlockSelector from './BlockSelector';
import Environment from './Environment';
import HUD from '../components/HUD';
import Chat from '../components/Chat';
import DamageIndicator from '../components/DamageIndicator';
import LoadingScreen from '../components/LoadingScreen';
import useGameStore from '../store/gameStore';
import useInventoryStore from '../store/inventoryStore';
import { emitJoin, onPlayerJoined, onPlayerMoved, onPlayerLeft, onPlayerList, onBlockUpdate, emitPlaceBlock, emitBreakBlock, emitAttack, onTakeDamage, onPlayerDied, onPlayerRespawn } from '../utils/socket';
import { castRay, checkPlayerCollision } from '../utils/raycaster';
import socket from '../utils/socket';

// Camera Controller Component with FPS controls
function CameraController({ player, world }) {
  const { camera } = useThree();

  useFrame(() => {
    if (!player) return;

    // Get camera direction for player movement
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0; // Keep movement on XZ plane
    direction.normalize();

    // Update player with camera direction
    player.update(direction);

    // Update player rotation based on camera
    const cameraRotation = {
      x: camera.rotation.x,
      y: camera.rotation.y
    };
    player.updateRotation(cameraRotation);

    // Position camera at player position (first-person view)
    const playerPos = player.getPosition();
    camera.position.set(playerPos.x, playerPos.y + 1.6, playerPos.z); // Eye level

    // Update world chunks based on player position
    if (world) {
      world.updateChunks(playerPos.x, playerPos.z);
    }
  });

  return (
    <PointerLockControls />
  );
}

// Player Mesh Component (for third-person view or multiplayer)
function PlayerMesh({ position }) {
  return (
    <mesh position={[position.x, position.y, position.z]} castShadow>
      <boxGeometry args={[1, 2, 1]} />
      <meshStandardMaterial color="#FF6B6B" />
    </mesh>
  );
}

// World Chunks Component
function WorldChunks({ world }) {
  const [chunks, setChunks] = useState([]);

  useEffect(() => {
    if (!world) return;

    // Initial load
    setChunks(world.getAllChunks());

    // Subscribe to chunk updates
    const unsubscribe = world.subscribe(() => {
      setChunks([...world.getAllChunks()]);
    });

    return unsubscribe;
  }, [world]);

  return (
    <>
      {chunks.map((chunk) => (
        <Chunk
          key={`${chunk.x},${chunk.z}`}
          chunkX={chunk.x}
          chunkZ={chunk.z}
          chunkData={chunk.data}
        />
      ))}
    </>
  );
}

// Main Scene Component
function Scene({ player, world, onTargetChange }) {
  const [playerPosition, setPlayerPosition] = useState({ x: 0, y: 20, z: 0 });
  const otherPlayers = useGameStore((state) => state.getOtherPlayersArray());

  useFrame(() => {
    if (player) {
      setPlayerPosition(player.getPosition());
    }
  });

  return (
    <>
      {/* Environment (clouds, sun, lighting, fog) */}
      <Environment />

      {/* World Chunks */}
      <WorldChunks world={world} />

      {/* Other Players */}
      {otherPlayers.map((otherPlayer) => (
        <OtherPlayer
          key={otherPlayer.id}
          playerId={otherPlayer.id}
          username={otherPlayer.username}
          position={otherPlayer.position}
          rotation={otherPlayer.rotation}
        />
      ))}

      {/* Block Selector */}
      <BlockSelector world={world} onTargetChange={onTargetChange} />

      {/* Camera Controls */}
      <CameraController player={player} world={world} />
    </>
  );
}

// Main Renderer Component
export default function Renderer({ username }) {
  const playerRef = useRef(null);
  const worldRef = useRef(null);
  const targetBlockRef = useRef(null);
  const [isLocked, setIsLocked] = useState(false);
  const [targetBlock, setTargetBlock] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [health, setHealth] = useState(100);
  const [isDead, setIsDead] = useState(false);
  const [respawnTimer, setRespawnTimer] = useState(3000);
  const [lastDamage, setLastDamage] = useState(null);

  const addPlayer = useGameStore((state) => state.addPlayer);
  const removePlayer = useGameStore((state) => state.removePlayer);
  const updatePlayerPosition = useGameStore((state) => state.updatePlayerPosition);

  const addItem = useInventoryStore((state) => state.addItem);
  const removeItem = useInventoryStore((state) => state.removeItem);
  const getSelectedBlockType = useInventoryStore((state) => state.getSelectedBlockType);
  const hasSelectedBlock = useInventoryStore((state) => state.hasSelectedBlock);
  const selectSlot = useInventoryStore((state) => state.selectSlot);
  const giveStarterBlocks = useInventoryStore((state) => state.giveStarterBlocks);
  const otherPlayers = useGameStore((state) => state.getOtherPlayersArray());

  // Update targetBlock ref whenever targetBlock state changes
  useEffect(() => {
    targetBlockRef.current = targetBlock;
  }, [targetBlock]);

  useEffect(() => {
    // Initialize player at a higher spawn point to see the world better
    playerRef.current = new Player(username, 0, 30, 0);

    // Initialize world
    worldRef.current = new World(socket);

    // Give player starter blocks for testing
    giveStarterBlocks();

    // Setup player callbacks for block interaction and combat
    playerRef.current.onBreakBlock = () => {
      // Check if targeting a block
      if (targetBlockRef.current) {
        const { chunkCoords, localPosition, blockType } = targetBlockRef.current;

        // Add block to inventory
        addItem(blockType);

        // Emit break block to server
        emitBreakBlock(
          chunkCoords.x,
          chunkCoords.z,
          localPosition.x,
          localPosition.y,
          localPosition.z
        );
        return;
      }

      // Not targeting a block - try to attack a player
      if (!playerRef.current.canAttack()) return; // Check cooldown

      // Raycast for players within 3 blocks
      const ATTACK_RANGE = 3;
      const playerPos = playerRef.current.getPosition();

      // Find closest player in crosshair direction
      let closestPlayer = null;
      let closestDistance = ATTACK_RANGE;

      // Get current other players from store
      const currentOtherPlayers = useGameStore.getState().getOtherPlayersArray();
      for (const other of currentOtherPlayers) {
        const dx = other.position.x - playerPos.x;
        const dy = other.position.y - playerPos.y;
        const dz = other.position.z - playerPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance <= ATTACK_RANGE && distance < closestDistance) {
          closestDistance = distance;
          closestPlayer = other;
        }
      }

      if (closestPlayer) {
        console.log('[RENDERER] Attacking player:', closestPlayer.username);
        emitAttack(closestPlayer.id);
      }
    };

    playerRef.current.onPlaceBlock = () => {
      if (!targetBlockRef.current) return;
      if (!hasSelectedBlock()) return;

      const selectedBlockType = getSelectedBlockType();
      if (!selectedBlockType) return;

      const { adjacentPosition } = targetBlockRef.current;

      // Check collision with player or other players
      const currentOtherPlayers = useGameStore.getState().getOtherPlayersArray();
      if (checkPlayerCollision(adjacentPosition, playerRef.current, currentOtherPlayers)) {
        console.log('[RENDERER] Cannot place block - would collide with player');
        return;
      }

      // Calculate chunk and local coordinates for adjacent position
      const CHUNK_SIZE = 16;
      const chunkX = Math.floor(adjacentPosition.x / CHUNK_SIZE);
      const chunkZ = Math.floor(adjacentPosition.z / CHUNK_SIZE);
      const localX = ((adjacentPosition.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localY = adjacentPosition.y;
      const localZ = ((adjacentPosition.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      // Remove block from inventory
      removeItem(selectedBlockType);

      // Emit place block to server
      emitPlaceBlock(chunkX, chunkZ, localX, localY, localZ, selectedBlockType);
    };

    playerRef.current.onSelectSlot = (slotIndex) => {
      selectSlot(slotIndex);
    };

    // Connect to socket and emit join
    console.log('[RENDERER] Joining game as:', username);
    emitJoin(username);

    // Start sending position updates to server
    playerRef.current.startPositionUpdates();

    // Load initial chunks around player spawn
    worldRef.current.updateChunks(0, 0);

    // Listen for multiplayer events
    const unsubPlayerJoined = onPlayerJoined(({ player }) => {
      console.log('[RENDERER] Player joined:', player.username);
      addPlayer(player);
    });

    const unsubPlayerMoved = onPlayerMoved(({ playerId, position, rotation }) => {
      updatePlayerPosition(playerId, position, rotation);
    });

    const unsubPlayerLeft = onPlayerLeft(({ playerId, username: leftUsername }) => {
      console.log('[RENDERER] Player left:', leftUsername);
      removePlayer(playerId);
    });

    const unsubPlayerList = onPlayerList(({ players }) => {
      console.log('[RENDERER] Received player list:', players.length, 'players');
      players.forEach((player) => {
        addPlayer(player);
      });
    });

    // Listen for block updates from server
    const unsubBlockUpdate = onBlockUpdate(({ chunkX, chunkZ, localX, localY, localZ, blockType }) => {
      console.log('[RENDERER] Block update received:', { chunkX, chunkZ, localX, localY, localZ, blockType });

      if (worldRef.current) {
        worldRef.current.updateBlock(chunkX, chunkZ, localX, localY, localZ, blockType);
      }
    });

    // Listen for damage events
    const unsubTakeDamage = onTakeDamage(({ amount, from, health: newHealth }) => {
      console.log('[RENDERER] Took damage:', amount, 'from', from);
      setHealth(newHealth);
      setLastDamage(Date.now());

      if (playerRef.current) {
        playerRef.current.health = newHealth;
      }
    });

    // Listen for death events
    const unsubPlayerDied = onPlayerDied(({ playerId }) => {
      if (playerId === socket.id) {
        console.log('[RENDERER] You died!');
        setIsDead(true);
        setHealth(0);

        // Countdown timer
        let remaining = 3000;
        setRespawnTimer(remaining);

        const interval = setInterval(() => {
          remaining -= 100;
          setRespawnTimer(Math.max(0, remaining));

          if (remaining <= 0) {
            clearInterval(interval);
          }
        }, 100);
      }
    });

    // Listen for respawn events
    const unsubPlayerRespawn = onPlayerRespawn(({ position, health: newHealth }) => {
      console.log('[RENDERER] Respawned!');
      setIsDead(false);
      setHealth(newHealth);
      setRespawnTimer(3000);

      if (playerRef.current) {
        playerRef.current.health = newHealth;
        playerRef.current.setPosition(position.x, position.y, position.z);
      }
    });

    // Hide loading screen after initial load
    setTimeout(() => setIsLoading(false), 1000);

    return () => {
      // Cleanup
      console.log('[RENDERER] Leaving game');
      if (playerRef.current) {
        playerRef.current.stopPositionUpdates();
      }
      if (worldRef.current) {
        worldRef.current.destroy();
      }
      unsubPlayerJoined();
      unsubPlayerMoved();
      unsubPlayerLeft();
      unsubPlayerList();
      unsubBlockUpdate();
      unsubTakeDamage();
      unsubPlayerDied();
      unsubPlayerRespawn();
    };
  }, [username]); // Only re-initialize if username changes

  useEffect(() => {
    const handlePointerLockChange = () => {
      setIsLocked(document.pointerLockElement !== null);
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Canvas
        shadows
        camera={{ position: [0, 21.6, 0], fov: 75 }}
        style={{ background: '#87CEEB' }}
      >
        <Scene
          player={playerRef.current}
          world={worldRef.current}
          onTargetChange={setTargetBlock}
        />
      </Canvas>

      {/* Loading Screen */}
      <LoadingScreen isLoading={isLoading} />

      {/* Click to play overlay */}
      {!isLocked && !isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          fontFamily: 'monospace',
          fontSize: '24px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          padding: '20px 40px',
          borderRadius: '10px',
          cursor: 'pointer',
          textAlign: 'center',
          zIndex: 10
        }}>
          <div>Click to Play</div>
          <div style={{ fontSize: '14px', marginTop: '10px', opacity: 0.8 }}>
            ESC to unlock cursor
          </div>
        </div>
      )}

      {/* Damage Indicator */}
      <DamageIndicator lastDamage={lastDamage} />

      {/* HUD Component */}
      <HUD
        player={playerRef.current}
        isLocked={isLocked}
        isDead={isDead}
        respawnTimer={respawnTimer}
        health={health}
      />

      {/* Chat Component */}
      <Chat isLocked={isLocked} />
    </div>
  );
}
