import { emitMove } from '../utils/socket';

export default class Player {
  constructor(username, startX = 0, startY = 20, startZ = 0) {
    this.username = username;
    this.position = { x: startX, y: startY, z: startZ };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0 };
    this.health = 100;
    this.isGrounded = false;

    // Movement parameters
    this.moveSpeed = 0.2;
    this.jumpForce = 0.5;
    this.gravity = -0.02;
    this.terminalVelocity = -1.0;

    // Keyboard state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false
    };

    // Position update interval
    this.positionUpdateInterval = null;
    this.lastSentPosition = null;

    // Block interaction callbacks
    this.onBreakBlock = null;
    this.onPlaceBlock = null;
    this.onSelectSlot = null;
    this.onAttack = null;

    // Combat
    this.lastAttackTime = 0;
    this.attackCooldown = 500; // 0.5 seconds in ms

    this.setupKeyboardControls();
    this.setupMouseControls();
  }

  setupKeyboardControls() {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW':
          this.keys.forward = true;
          break;
        case 'KeyS':
          this.keys.backward = true;
          break;
        case 'KeyA':
          this.keys.left = true;
          break;
        case 'KeyD':
          this.keys.right = true;
          break;
        case 'Space':
          this.keys.jump = true;
          e.preventDefault(); // Prevent page scroll
          break;
        // Hotbar selection (1-5 keys)
        case 'Digit1':
          if (this.onSelectSlot) this.onSelectSlot(0);
          break;
        case 'Digit2':
          if (this.onSelectSlot) this.onSelectSlot(1);
          break;
        case 'Digit3':
          if (this.onSelectSlot) this.onSelectSlot(2);
          break;
        case 'Digit4':
          if (this.onSelectSlot) this.onSelectSlot(3);
          break;
        case 'Digit5':
          if (this.onSelectSlot) this.onSelectSlot(4);
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
          this.keys.forward = false;
          break;
        case 'KeyS':
          this.keys.backward = false;
          break;
        case 'KeyA':
          this.keys.left = false;
          break;
        case 'KeyD':
          this.keys.right = false;
          break;
        case 'Space':
          this.keys.jump = false;
          break;
      }
    });
  }

  setupMouseControls() {
    window.addEventListener('mousedown', (e) => {
      // Only handle clicks when pointer is locked
      if (document.pointerLockElement === null) return;

      if (e.button === 0) {
        // Left click - break block or attack
        if (this.onBreakBlock) {
          this.onBreakBlock(); // This will handle both block breaking and combat
        }
      } else if (e.button === 2) {
        // Right click - place block
        if (this.onPlaceBlock) {
          this.onPlaceBlock();
        }
        e.preventDefault();
      }
    });

    // Prevent context menu on right click
    window.addEventListener('contextmenu', (e) => {
      if (document.pointerLockElement !== null) {
        e.preventDefault();
      }
    });
  }

  /**
   * Attempt to attack (with cooldown check)
   */
  canAttack() {
    const now = Date.now();
    if (now - this.lastAttackTime < this.attackCooldown) {
      return false;
    }
    this.lastAttackTime = now;
    return true;
  }

  moveForward(cameraDirection) {
    // Move in the direction the camera is facing (XZ plane only)
    const direction = { x: cameraDirection.x, z: cameraDirection.z };
    const length = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    if (length > 0) {
      direction.x /= length;
      direction.z /= length;
    }
    this.position.x += direction.x * this.moveSpeed;
    this.position.z += direction.z * this.moveSpeed;
  }

  moveBackward(cameraDirection) {
    const direction = { x: cameraDirection.x, z: cameraDirection.z };
    const length = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    if (length > 0) {
      direction.x /= length;
      direction.z /= length;
    }
    this.position.x -= direction.x * this.moveSpeed;
    this.position.z -= direction.z * this.moveSpeed;
  }

  strafeLeft(cameraDirection) {
    // Move perpendicular to camera direction
    const right = {
      x: -cameraDirection.z,
      z: cameraDirection.x
    };
    const length = Math.sqrt(right.x * right.x + right.z * right.z);
    if (length > 0) {
      right.x /= length;
      right.z /= length;
    }
    this.position.x -= right.x * this.moveSpeed;
    this.position.z -= right.z * this.moveSpeed;
  }

  strafeRight(cameraDirection) {
    const right = {
      x: -cameraDirection.z,
      z: cameraDirection.x
    };
    const length = Math.sqrt(right.x * right.x + right.z * right.z);
    if (length > 0) {
      right.x /= length;
      right.z /= length;
    }
    this.position.x += right.x * this.moveSpeed;
    this.position.z += right.z * this.moveSpeed;
  }

  jump() {
    if (this.isGrounded) {
      this.velocity.y = this.jumpForce;
      this.isGrounded = false;
    }
  }

  update(cameraDirection) {
    // Handle keyboard input
    if (this.keys.forward) {
      this.moveForward(cameraDirection);
    }
    if (this.keys.backward) {
      this.moveBackward(cameraDirection);
    }
    if (this.keys.left) {
      this.strafeLeft(cameraDirection);
    }
    if (this.keys.right) {
      this.strafeRight(cameraDirection);
    }
    if (this.keys.jump) {
      this.jump();
    }

    // Apply gravity
    this.velocity.y += this.gravity;

    // Clamp to terminal velocity
    if (this.velocity.y < this.terminalVelocity) {
      this.velocity.y = this.terminalVelocity;
    }

    // Apply velocity to position
    this.position.y += this.velocity.y;

    // Ground collision - stop at terrain level
    // For now, use a fixed ground level of y=20 (we'll improve this with proper terrain collision later)
    const groundLevel = 18; // Slightly above average terrain height
    if (this.position.y <= groundLevel) {
      this.position.y = groundLevel;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }
  }

  getPosition() {
    return { ...this.position };
  }

  setPosition(x, y, z) {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
  }

  getHealth() {
    return this.health;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
  }

  /**
   * Start emitting position updates to server (20 updates/sec = 50ms)
   */
  startPositionUpdates() {
    if (this.positionUpdateInterval) {
      return; // Already started
    }

    this.positionUpdateInterval = setInterval(() => {
      // Only send if position has changed significantly
      if (this.lastSentPosition) {
        const dx = this.position.x - this.lastSentPosition.x;
        const dy = this.position.y - this.lastSentPosition.y;
        const dz = this.position.z - this.lastSentPosition.z;
        const distanceMoved = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Only send if moved more than 0.01 units
        if (distanceMoved < 0.01) {
          return;
        }
      }

      emitMove(
        { ...this.position },
        { ...this.rotation }
      );

      this.lastSentPosition = { ...this.position };
    }, 50);
  }

  /**
   * Stop emitting position updates
   */
  stopPositionUpdates() {
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }
  }

  /**
   * Update rotation based on camera
   */
  updateRotation(cameraRotation) {
    this.rotation = cameraRotation;
  }
}
