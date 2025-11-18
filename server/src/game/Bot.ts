import { PlayerEntity } from './Player.js';
import { GAME_CONFIG } from '../types/game.types.js';

interface BotTarget {
  id: string;
  x: number;
  y: number;
  distance: number;
}

type BotDifficulty = 0 | 1 | 2 | 3 | 4;

interface DifficultySettings {
  name: string;
  reactionTime: number;
  accuracy: number;
  aggression: number;
  detectionRange: number;
  shootChance: number;
}

const DIFFICULTY_SETTINGS: Record<BotDifficulty, DifficultySettings> = {
  0: { name: 'Very Easy', reactionTime: 800, accuracy: 0.30, aggression: 0.20, detectionRange: 300, shootChance: 0.10 },
  1: { name: 'Easy', reactionTime: 500, accuracy: 0.50, aggression: 0.40, detectionRange: 350, shootChance: 0.20 },
  2: { name: 'Medium', reactionTime: 300, accuracy: 0.65, aggression: 0.55, detectionRange: 400, shootChance: 0.30 },
  3: { name: 'Hard', reactionTime: 150, accuracy: 0.80, aggression: 0.70, detectionRange: 450, shootChance: 0.40 },
  4: { name: 'Expert', reactionTime: 80, accuracy: 0.92, aggression: 0.85, detectionRange: 500, shootChance: 0.50 }
};

export class BotEntity extends PlayerEntity {
  private aiState: 'idle' | 'hunting' | 'fleeing' | 'wandering' = 'wandering';
  private targetId: string | null = null;
  private wanderAngle: number = Math.random() * Math.PI * 2;
  private lastStateChange: number = Date.now();
  private lastDirectionChange: number = Date.now();
  private difficulty: BotDifficulty;
  private settings: DifficultySettings;
  private isBot: boolean = true;

  // Smooth movement/rotation
  private targetAngle: number = 0;
  private currentMoveX: number = 0;
  private currentMoveY: number = 0;
  private lastAIUpdate: number = Date.now();

  constructor(
    id: string,
    username: string,
    spawnX: number,
    spawnY: number,
    difficulty: BotDifficulty = 2
  ) {
    super(id, username, spawnX, spawnY);

    this.difficulty = difficulty;
    this.settings = DIFFICULTY_SETTINGS[difficulty];
  }

  // AI decision making
  updateAI(players: Map<string, PlayerEntity>, deltaTime: number): void {
    if (!this.isAlive) return;

    const now = Date.now();

    // Update AI decisions less frequently for smoother movement
    // AI thinks every 100-200ms instead of every frame
    const aiThinkInterval = this.settings.reactionTime;
    const shouldThink = now - this.lastAIUpdate >= aiThinkInterval;

    if (shouldThink) {
      this.lastAIUpdate = now;
      this.makeDecision(players, now);
    }

    // Always smooth out rotation and movement
    this.smoothMovement(deltaTime);
  }

  private makeDecision(players: Map<string, PlayerEntity>, now: number): void {
    // Find nearest player
    const nearestPlayer = this.findNearestPlayer(players);

    // State machine
    if (nearestPlayer) {
      const distance = nearestPlayer.distance;
      const fleeRange = 150;

      if (this.health < 30 && distance < fleeRange) {
        this.aiState = 'fleeing';
        this.targetId = nearestPlayer.id;
      } else if (distance < this.settings.detectionRange) {
        if (Math.random() < this.settings.aggression) {
          this.aiState = 'hunting';
          this.targetId = nearestPlayer.id;
        } else {
          this.aiState = 'wandering';
        }
      } else {
        this.aiState = 'wandering';
      }
    } else {
      this.aiState = 'wandering';
    }

    // Execute behavior based on state
    switch (this.aiState) {
      case 'hunting':
        if (nearestPlayer) {
          this.huntTarget(nearestPlayer, players);
        }
        break;
      case 'fleeing':
        if (nearestPlayer) {
          this.fleeFromTarget(nearestPlayer);
        }
        break;
      case 'wandering':
        this.wander(now);
        break;
    }
  }

  private findNearestPlayer(players: Map<string, PlayerEntity>): BotTarget | null {
    let nearest: BotTarget | null = null;
    let minDistance = Infinity;

    for (const [id, player] of players) {
      // Skip self and dead players
      if (id === this.id || !player.isAlive) continue;

      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearest = {
          id: player.id,
          x: player.x,
          y: player.y,
          distance
        };
      }
    }

    return nearest;
  }

  private huntTarget(target: BotTarget, players: Map<string, PlayerEntity>): void {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Set target angle (will be smoothly interpolated)
    this.targetAngle = Math.atan2(dy, dx);

    // Move towards target but maintain some distance
    const optimalDistance = 250;
    if (distance > optimalDistance) {
      // Move closer
      this.currentMoveX = dx / distance;
      this.currentMoveY = dy / distance;
    } else if (distance < optimalDistance * 0.7) {
      // Strafe around target (circle strafe)
      const strafeAngle = this.targetAngle + Math.PI / 2;
      this.currentMoveX = Math.cos(strafeAngle);
      this.currentMoveY = Math.sin(strafeAngle);
    } else {
      // In optimal range, strafe
      const strafeAngle = this.targetAngle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
      this.currentMoveX = Math.cos(strafeAngle) * 0.5;
      this.currentMoveY = Math.sin(strafeAngle) * 0.5;
    }
  }

  private fleeFromTarget(target: BotTarget): void {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Run away from target
    this.currentMoveX = -dx / distance;
    this.currentMoveY = -dy / distance;

    // Still aim at target while fleeing
    this.targetAngle = Math.atan2(dy, dx);
  }

  private wander(now: number): void {
    // Change direction every 2-4 seconds
    const directionChangeInterval = 2000 + Math.random() * 2000;
    if (now - this.lastDirectionChange > directionChangeInterval) {
      this.wanderAngle = Math.random() * Math.PI * 2;
      this.lastDirectionChange = now;
    }

    // Move in wander direction
    this.currentMoveX = Math.cos(this.wanderAngle) * 0.6;
    this.currentMoveY = Math.sin(this.wanderAngle) * 0.6;

    this.targetAngle = this.wanderAngle;
  }

  // Smooth interpolation for movement and rotation
  private smoothMovement(deltaTime: number): void {
    // Smooth rotation - lerp towards target angle
    const rotationSpeed = 8.0; // Higher = faster rotation
    const angleDiff = this.targetAngle - this.angle;

    // Normalize angle difference to -PI to PI
    let normalizedDiff = angleDiff;
    while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
    while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;

    // Lerp angle
    this.angle += normalizedDiff * rotationSpeed * deltaTime;

    // Apply current movement (already smoothed by decision frequency)
    this.setMovement(this.currentMoveX, this.currentMoveY);
  }

  // Check if bot wants to shoot (for game engine to create bullet)
  wantsToShoot(): boolean {
    // Use difficulty-based shoot chance
    return this.canShoot() &&
           (this.aiState === 'hunting' || this.aiState === 'fleeing') &&
           Math.random() < this.settings.shootChance;
  }

  // Apply aim error when shooting (not when aiming)
  getShootAngle(): number {
    const angleVariance = (1 - this.settings.accuracy) * 0.4; // Max variance based on accuracy
    const aimError = (Math.random() - 0.5) * angleVariance;
    return this.angle + aimError;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      isBot: this.isBot
    };
  }
}
