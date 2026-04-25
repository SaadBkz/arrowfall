// Spec §0 + §5.1. World-scale constants used by both renderer and simulation.

export const TILE_SIZE = 16; // px
export const ARENA_WIDTH_TILES = 30;
export const ARENA_HEIGHT_TILES = 17;

// Note: 17 × 16 = 272, but the spec fixes the logical framebuffer at 480×270.
// Wrap and rendering use the pixel constants below; the bottom 2 px overflow
// is intentional (the bottom row is part of the floor / off-screen border).
export const ARENA_WIDTH_PX = 480;
export const ARENA_HEIGHT_PX = 270;

export const TICK_RATE_HZ = 60; // internal simulation step
export const SERVER_BROADCAST_HZ = 30; // every other tick is sent over the wire
