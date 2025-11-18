import { createNoise2D } from 'simplex-noise';

// Create noise generator
const noise2D = createNoise2D();

// Chunk configuration
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 64;

// Terrain generation parameters
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 50;  // Increased for mountains
const TERRAIN_SCALE = 0.02; // Larger features
const OCTAVES = 6; // More detail
const MOUNTAIN_SCALE = 0.01; // Large mountain features
const TREE_PROBABILITY = 0.05; // 5% chance per grass block

// Block types
export const BlockType = {
  AIR: 'air',
  GRASS: 'grass',
  DIRT: 'dirt',
  STONE: 'stone',
  WOOD: 'wood',
  LEAVES: 'leaves',
  WATER: 'water'
};

/**
 * Generate a 2D Perlin noise height map for a chunk
 * @param {number} chunkX - Chunk X coordinate
 * @param {number} chunkZ - Chunk Z coordinate
 * @returns {Array<Array<number>>} - 2D array of height values
 */
function generateHeightMap(chunkX, chunkZ) {
  const heightMap = [];

  for (let x = 0; x < CHUNK_SIZE; x++) {
    heightMap[x] = [];
    for (let z = 0; z < CHUNK_SIZE; z++) {
      // World coordinates
      const worldX = chunkX * CHUNK_SIZE + x;
      const worldZ = chunkZ * CHUNK_SIZE + z;

      // Generate multi-octave noise for more detail
      let noiseValue = 0;
      let amplitude = 1;
      let frequency = TERRAIN_SCALE;
      let maxValue = 0;

      for (let i = 0; i < OCTAVES; i++) {
        noiseValue += noise2D(worldX * frequency, worldZ * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }

      // Normalize to 0-1 range
      noiseValue = (noiseValue / maxValue + 1) / 2;

      // Add mountain features with separate noise
      const mountainNoise = (noise2D(worldX * MOUNTAIN_SCALE, worldZ * MOUNTAIN_SCALE) + 1) / 2;

      // Combine terrain and mountains - mountains add extra height
      const mountainInfluence = Math.pow(mountainNoise, 2.5); // Power curve for dramatic peaks
      const finalNoise = noiseValue * 0.4 + mountainInfluence * 0.6;

      // Clamp between 0 and 1
      const clampedNoise = Math.max(0, Math.min(1, finalNoise));

      // Map to height range
      const height = Math.floor(MIN_HEIGHT + clampedNoise * (MAX_HEIGHT - MIN_HEIGHT));
      heightMap[x][z] = height;
    }
  }

  return heightMap;
}

/**
 * Generate a voxel chunk with terrain
 * @param {number} chunkX - Chunk X coordinate
 * @param {number} chunkZ - Chunk Z coordinate
 * @returns {Array} - 3D array of block types [x][y][z]
 */
export function generateChunk(chunkX, chunkZ) {
  const chunk = [];

  // Initialize chunk with air
  for (let x = 0; x < CHUNK_SIZE; x++) {
    chunk[x] = [];
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      chunk[x][y] = [];
      for (let z = 0; z < CHUNK_SIZE; z++) {
        chunk[x][y][z] = BlockType.AIR;
      }
    }
  }

  // Generate height map
  const heightMap = generateHeightMap(chunkX, chunkZ);

  // Fill in terrain based on height map
  const treePositions = []; // Store tree positions for later generation

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const terrainHeight = heightMap[x][z];

      for (let y = 0; y < terrainHeight; y++) {
        if (y === terrainHeight - 1) {
          // Top layer is grass
          chunk[x][y][z] = BlockType.GRASS;

          // Chance to spawn a tree on grass (not too high, not too low)
          if (terrainHeight > 10 && terrainHeight < 35 && Math.random() < TREE_PROBABILITY) {
            treePositions.push({ x, y: terrainHeight, z });
          }
        } else if (y >= terrainHeight - 4) {
          // Next 3 layers are dirt
          chunk[x][y][z] = BlockType.DIRT;
        } else {
          // Everything below is stone
          chunk[x][y][z] = BlockType.STONE;
        }
      }

      // Add water at low elevations
      const WATER_LEVEL = 12;
      if (terrainHeight < WATER_LEVEL) {
        for (let y = terrainHeight; y < WATER_LEVEL; y++) {
          chunk[x][y][z] = BlockType.WATER;
        }
      }
    }
  }

  // Generate trees
  for (const treePos of treePositions) {
    generateTree(chunk, treePos.x, treePos.y, treePos.z);
  }

  return chunk;
}

/**
 * Generate a tree at the specified position
 * @param {Array} chunk - The chunk data
 * @param {number} x - Local X coordinate
 * @param {number} y - Y coordinate (ground level)
 * @param {number} z - Local Z coordinate
 */
function generateTree(chunk, x, y, z) {
  const TREE_HEIGHT = 5 + Math.floor(Math.random() * 3); // 5-7 blocks tall
  const TRUNK_HEIGHT = TREE_HEIGHT - 2;

  // Generate trunk
  for (let dy = 0; dy < TRUNK_HEIGHT; dy++) {
    const blockY = y + dy;
    if (blockY < CHUNK_HEIGHT) {
      chunk[x][blockY][z] = BlockType.WOOD;
    }
  }

  // Generate leaves (3x3x3 cube at top)
  const leavesY = y + TRUNK_HEIGHT;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = 0; dy < 3; dy++) {
        const leafX = x + dx;
        const leafZ = z + dz;
        const leafY = leavesY + dy;

        // Check bounds
        if (leafX >= 0 && leafX < CHUNK_SIZE &&
            leafZ >= 0 && leafZ < CHUNK_SIZE &&
            leafY < CHUNK_HEIGHT) {

          // Don't overwrite trunk
          if (!(dx === 0 && dz === 0 && dy === 0)) {
            chunk[leafX][leafY][leafZ] = BlockType.LEAVES;
          }
        }
      }
    }
  }

  // Add top leaf
  if (leavesY + 3 < CHUNK_HEIGHT) {
    chunk[x][leavesY + 3][z] = BlockType.LEAVES;
  }
}

/**
 * Get the height of terrain at a specific world position
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @returns {number} - Terrain height at this position
 */
export function getTerrainHeight(worldX, worldZ) {
  // Simple noise-based height calculation
  const noiseValue = Math.abs(Math.sin(worldX * TERRAIN_SCALE) * Math.cos(worldZ * TERRAIN_SCALE));
  return Math.floor(MIN_HEIGHT + noiseValue * (MAX_HEIGHT - MIN_HEIGHT));
}

/**
 * Check if a position is solid ground
 * @param {Array} chunk - The chunk data
 * @param {number} x - Local X coordinate (0-15)
 * @param {number} y - Y coordinate
 * @param {number} z - Local Z coordinate (0-15)
 * @returns {boolean} - True if position is solid
 */
export function isSolid(chunk, x, y, z) {
  if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) {
    return false;
  }

  const blockType = chunk[x][y][z];
  return blockType !== BlockType.AIR;
}
