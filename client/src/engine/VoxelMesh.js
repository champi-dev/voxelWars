import * as THREE from 'three';
import Block, { BlockType } from './Block';

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 64;

/**
 * Convert 3D coordinates to 1D array index
 */
export function coordsToIndex(x, y, z) {
  return x * CHUNK_HEIGHT * CHUNK_SIZE + y * CHUNK_SIZE + z;
}

/**
 * Convert 1D array index to 3D coordinates
 */
export function indexToCoords(index) {
  const x = Math.floor(index / (CHUNK_HEIGHT * CHUNK_SIZE));
  const y = Math.floor((index % (CHUNK_HEIGHT * CHUNK_SIZE)) / CHUNK_SIZE);
  const z = index % CHUNK_SIZE;
  return { x, y, z };
}

/**
 * Get block at position, return 'air' if out of bounds
 */
function getBlock(chunkData, x, y, z) {
  if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
    return BlockType.AIR;
  }
  return chunkData[x][y][z];
}

/**
 * Check if a face should be rendered (face is exposed to air)
 */
function shouldRenderFace(chunkData, x, y, z, direction) {
  const [dx, dy, dz] = direction;
  const neighborType = getBlock(chunkData, x + dx, y + dy, z + dz);
  return neighborType === BlockType.AIR;
}

/**
 * Create a simple voxel mesh (non-greedy version for initial implementation)
 * This renders individual cubes for each solid block
 */
export function createSimpleChunkMesh(chunkData) {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const normals = [];
  const colors = [];
  const indices = [];

  // Face definitions: [normal, vertices]
  const faces = [
    // Front (+Z)
    { normal: [0, 0, 1], vertices: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], dir: [0, 0, 1] },
    // Back (-Z)
    { normal: [0, 0, -1], vertices: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], dir: [0, 0, -1] },
    // Top (+Y)
    { normal: [0, 1, 0], vertices: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], dir: [0, 1, 0] },
    // Bottom (-Y)
    { normal: [0, -1, 0], vertices: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], dir: [0, -1, 0] },
    // Right (+X)
    { normal: [1, 0, 0], vertices: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], dir: [1, 0, 0] },
    // Left (-X)
    { normal: [-1, 0, 0], vertices: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]], dir: [-1, 0, 0] }
  ];

  let vertexOffset = 0;

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const blockType = chunkData[x][y][z];

        if (blockType === BlockType.AIR) continue;

        const blockColor = new THREE.Color(Block.getColor(blockType));

        // Render each face if it's exposed
        for (const face of faces) {
          if (shouldRenderFace(chunkData, x, y, z, face.dir)) {
            // Add vertices for this face
            for (const vertex of face.vertices) {
              vertices.push(
                x + vertex[0],
                y + vertex[1],
                z + vertex[2]
              );
              normals.push(...face.normal);
              colors.push(blockColor.r, blockColor.g, blockColor.b);
            }

            // Add indices for two triangles (quad)
            indices.push(
              vertexOffset + 0, vertexOffset + 1, vertexOffset + 2,
              vertexOffset + 0, vertexOffset + 2, vertexOffset + 3
            );

            vertexOffset += 4;
          }
        }
      }
    }
  }

  if (vertices.length === 0) {
    // Empty chunk, return null
    return null;
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide  // Render both sides to fix holes between chunks
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

/**
 * Greedy meshing algorithm
 * Combines adjacent blocks of the same type to reduce face count
 */
export function createChunkMesh(chunkData) {
  // For now, use simple meshing
  // TODO: Implement full greedy meshing for better performance
  return createSimpleChunkMesh(chunkData);
}

/**
 * Optimized greedy meshing (future implementation)
 * This will merge adjacent faces of the same type
 */
export function createGreedyChunkMesh(chunkData) {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const normals = [];
  const colors = [];
  const indices = [];

  let vertexOffset = 0;

  // Greedy meshing for each axis
  const dims = [
    [CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE],
    [CHUNK_HEIGHT, CHUNK_SIZE, CHUNK_SIZE],
    [CHUNK_SIZE, CHUNK_SIZE, CHUNK_HEIGHT]
  ];

  // For each axis (X, Y, Z)
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;

    const d = [0, 0, 0];
    const q = [0, 0, 0];
    q[axis] = 1;

    // For each slice along this axis
    for (d[axis] = 0; d[axis] < dims[axis][axis]; d[axis]++) {
      // Create mask for this slice
      const mask = new Array(dims[axis][u] * dims[axis][v]).fill(null);

      // Build mask
      for (d[v] = 0; d[v] < dims[axis][v]; d[v]++) {
        for (d[u] = 0; d[u] < dims[axis][u]; d[u]++) {
          const blockType = getBlock(chunkData, d[0], d[1], d[2]);
          const neighborType = getBlock(chunkData, d[0] + q[0], d[1] + q[1], d[2] + q[2]);

          if (blockType !== BlockType.AIR && neighborType === BlockType.AIR) {
            mask[d[u] + d[v] * dims[axis][u]] = blockType;
          }
        }
      }

      // Generate mesh from mask using greedy meshing
      for (let j = 0; j < dims[axis][v]; j++) {
        for (let i = 0; i < dims[axis][u];) {
          if (mask[i + j * dims[axis][u]] !== null) {
            const currentType = mask[i + j * dims[axis][u]];

            // Find width
            let w;
            for (w = 1; i + w < dims[axis][u] && mask[i + w + j * dims[axis][u]] === currentType; w++) {}

            // Find height
            let h;
            let done = false;
            for (h = 1; j + h < dims[axis][v]; h++) {
              for (let k = 0; k < w; k++) {
                if (mask[i + k + (j + h) * dims[axis][u]] !== currentType) {
                  done = true;
                  break;
                }
              }
              if (done) break;
            }

            // Add quad
            d[u] = i;
            d[v] = j;

            const du = [0, 0, 0];
            du[u] = w;
            const dv = [0, 0, 0];
            dv[v] = h;

            const blockColor = new THREE.Color(Block.getColor(currentType));

            // Add vertices for merged quad
            vertices.push(d[0], d[1], d[2]);
            vertices.push(d[0] + du[0], d[1] + du[1], d[2] + du[2]);
            vertices.push(d[0] + du[0] + dv[0], d[1] + du[1] + dv[1], d[2] + du[2] + dv[2]);
            vertices.push(d[0] + dv[0], d[1] + dv[1], d[2] + dv[2]);

            for (let n = 0; n < 4; n++) {
              normals.push(q[0], q[1], q[2]);
              colors.push(blockColor.r, blockColor.g, blockColor.b);
            }

            indices.push(
              vertexOffset + 0, vertexOffset + 1, vertexOffset + 2,
              vertexOffset + 0, vertexOffset + 2, vertexOffset + 3
            );

            vertexOffset += 4;

            // Clear mask
            for (let l = 0; l < h; l++) {
              for (let k = 0; k < w; k++) {
                mask[i + k + (j + l) * dims[axis][u]] = null;
              }
            }

            i += w;
          } else {
            i++;
          }
        }
      }
    }
  }

  if (vertices.length === 0) {
    return null;
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide  // Render both sides to fix holes between chunks
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}
