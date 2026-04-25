// All values from arrowfall-spec.md §2. Units: pixels (logical 480×270 framebuffer)
// and frames (60 Hz internal sim). Values are tuned empirically — bump versions
// when the spec changes.

// §2.1 Gravité et chute
export const GRAVITY = 0.3; // px/frame²
export const MAX_FALL_SPEED = 4.0; // px/frame
export const FAST_FALL_SPEED = 6.0; // px/frame — when "down" is held mid-air

// §2.2 Marche
export const WALK_ACCEL = 0.2; // px/frame²
export const WALK_MAX_SPEED = 2.0; // px/frame
export const WALK_FRICTION_GROUND = 0.3; // px/frame²
export const WALK_FRICTION_AIR = 0.1; // px/frame²

// §2.3 Saut
export const JUMP_VELOCITY = -4.5; // px/frame (negative = upward)
export const JUMP_GRACE_FRAMES = 6; // coyote time after leaving a platform
export const JUMP_BUFFER_FRAMES = 6; // buffered jump before landing
export const WALL_JUMP_VELOCITY_X = 3.0; // ± along the X axis
export const WALL_JUMP_VELOCITY_Y = -4.0; // upward kick

// §2.4 Dodge — central mechanic
export const DODGE_SPEED = 4.0; // px/frame
export const DODGE_DURATION_FRAMES = 8;
export const DODGE_INVINCIBILITY_FRAMES = 12; // covers the dodge plus a small after-window
export const DODGE_COOLDOWN_FRAMES = 30; // anti-spam
export const DODGE_CATCH_WINDOW_FRAMES = 12; // arrow contact during this window = catch, not death

// §2.5 Stomp
export const STOMP_BOUNCE_VELOCITY = -3.5; // upward bounce after a successful head-stomp

// §2.6 Hitboxes — head sub-AABB used for stomp detection (top 3 px of the
// 8×11 body). Phase 3 surfaces this constant so both the engine resolver and
// any tooling/renderer share the same value.
export const HEAD_HITBOX_H = 3;

// §3.1 Inventory
export const SPAWN_ARROW_COUNT = 3;
export const MAX_INVENTORY = 5;

// §3.2 Lifecycle
export const SPAWN_IFRAME_FRAMES = 60; // 1 s of post-spawn invincibility
export const DEATH_DURATION_FRAMES = 30; // body lingers this long before despawn

// §4.1 Shoot mechanic — Normal arrow only in Phase 3.
export const SHOOT_COOLDOWN_FRAMES = 8;
export const ARROW_GROUNDED_PICKUP_DELAY = 10; // grace after landing before pickup is allowed

// §4.2 Arrow physics — Normal arrow.
export const ARROW_SPEED = 5.0; // px/frame (initial muzzle speed)
