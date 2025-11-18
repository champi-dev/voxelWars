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

// Block color mapping
export const BlockColors = {
  [BlockType.GRASS]: '#7EC850',
  [BlockType.DIRT]: '#8B4513',
  [BlockType.STONE]: '#808080',
  [BlockType.WOOD]: '#8B4513',
  [BlockType.LEAVES]: '#228B22',
  [BlockType.WATER]: '#4A90E2',
  [BlockType.AIR]: '#000000' // Not rendered
};

export default class Block {
  constructor(type) {
    this.type = type;
  }

  getType() {
    return this.type;
  }

  getColor() {
    return BlockColors[this.type];
  }

  isSolid() {
    return this.type !== BlockType.AIR;
  }

  static isSolid(blockType) {
    return blockType !== BlockType.AIR;
  }

  static getColor(blockType) {
    return BlockColors[blockType] || '#FF00FF'; // Magenta for unknown blocks
  }
}
