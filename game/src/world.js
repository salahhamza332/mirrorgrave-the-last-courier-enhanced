// Mirrorgrave: The Last Courier — world definition
// Floating cemetery island: tiles, obstacles, fog, patrols, relics, bells, the barge.

export const SIZE = 46;
export const TILE = { VOID: 0, GRASS: 1, PATH: 2, STONE: 3 };

// Deterministic PRNG so the island is the same for every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CX = SIZE / 2, CY = SIZE / 2, RX = 21.5, RY = 19.5;

function isIsland(x, y) {
  const nx = (x - CX) / RX, ny = (y - CY) / RY;
  return Math.pow(Math.abs(nx), 2.6) + Math.pow(Math.abs(ny), 2.6) < 1;
}

// Distance helper
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Fixed points of interest (tile coords, floats)
export const SPONSOR = { x: 8.5, y: 37.5 };        // courier's landing — southwest
export const BARGE = { x: 7.2, y: 39.6 };          // extraction barge — off the SW dock
const RELIC_SPOTS = [
  { x: 36.5, y: 9.5,  name: 'the Chalice of Lowfield', puzzle: 'open' },
  { x: 9.5,  y: 11.0, name: 'the Mirror Sigil',        puzzle: 'reveal' },
  { x: 27.0, y: 33.5, name: 'the Pale Lantern',        puzzle: 'ward' },
];
// Secrets: whispered echoes (lantern-revealed) and epitaphs (lore, always visible)
const ECHO_SPOTS = [ { x: 15.5, y: 21.0 }, { x: 38.0, y: 24.5 }, { x: 25.5, y: 7.5 } ];
const EPITAPHS = [
  { x: 19.2, y: 29.5, text: 'HERE LIE THE THREE WHO CARRIED THE DAWN — AND GAVE IT BACK.' },
  { x: 33.0, y: 15.0, text: 'THE WATCH DOES NOT SLEEP. THE WATCH ONLY WAITS.' },
  { x: 12.5, y: 33.0, text: 'COUNT TWO BELLS, AND THE PALE WARD WILL LOOSEN.' },
];
const BELL_SPOTS = [
  { x: 22.5, y: 14.5 },
  { x: 13.5, y: 25.5 },
  { x: 33.0, y: 26.0 },
];
const MAUSOLEUMS = [
  { x: 17, y: 8,  w: 3, h: 2 },
  { x: 30, y: 17, w: 2, h: 3 },
  { x: 14, y: 33, w: 3, h: 2 },
];
const FOG_PATCHES = [
  { x: 18, y: 22, r: 4.2 },
  { x: 29, y: 12, r: 3.6 },
  { x: 12, y: 17, r: 3.4 },
  { x: 26, y: 30, r: 3.8 },
  { x: 36, y: 20, r: 3.2 },
];
const GUARD_PATROLS = [
  [ { x: 22, y: 8 }, { x: 34, y: 12 }, { x: 30, y: 19 }, { x: 20, y: 15 } ],
  [ { x: 33, y: 25 }, { x: 40, y: 17 }, { x: 37, y: 9 } ],
  [ { x: 9, y: 18 }, { x: 16, y: 13 }, { x: 21, y: 22 }, { x: 12, y: 27 } ],
  [ { x: 24, y: 34 }, { x: 33, y: 34 }, { x: 38, y: 27 }, { x: 28, y: 27 } ],
  [ { x: 17, y: 27 }, { x: 10, y: 34 }, { x: 22, y: 38 }, { x: 26, y: 30 } ],
];

export function buildWorld() {
  const rnd = mulberry32(0xC0FFEE);
  const tiles = new Uint8Array(SIZE * SIZE);
  const shade = new Float32Array(SIZE * SIZE); // per-tile brightness jitter

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      if (!isIsland(x + 0.5, y + 0.5)) { tiles[i] = TILE.VOID; continue; }
      tiles[i] = TILE.GRASS;
      shade[i] = rnd();
    }
  }

  // Stone paths: SW landing → centre, and centre → east side; plus a north spur.
  const pathLine = (x0, y0, x1, y1, w) => {
    const steps = Math.ceil(dist(x0, y0, x1, y1) * 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
      for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) {
        const tx = Math.floor(px + dx), ty = Math.floor(py + dy);
        if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) continue;
        if (tiles[ty * SIZE + tx] === TILE.GRASS && dx * dx + dy * dy <= w * w + 0.4) tiles[ty * SIZE + tx] = TILE.PATH;
      }
    }
  };
  pathLine(9, 37, 23, 23, 1);
  pathLine(23, 23, 38, 12, 1);
  pathLine(23, 23, 13, 12, 1);
  pathLine(23, 23, 29, 34, 1);

  // Central plaza — pale stone circle
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (dist(x + 0.5, y + 0.5, 23, 23) < 3.1 && tiles[y * SIZE + x] !== TILE.VOID) tiles[y * SIZE + x] = TILE.STONE;
  }

  const blocked = (x, y) => {
    const t = tiles[Math.floor(y) * SIZE + Math.floor(x)];
    return t === TILE.VOID;
  };

  // Mausoleums (2x2 / 3x2 blocks) — big cover, also block sight
  const obstacles = []; // {x,y,w,h,type, hp?} in tile units
  for (const m of MAUSOLEUMS) obstacles.push({ ...m, type: 'mausoleum' });

  // Scatter graves — keep clear of relics, bells, barge, paths, spawn
  const graves = [];
  const keepClear = [...RELIC_SPOTS, ...BELL_SPOTS, { x: SPONSOR.x, y: SPONSOR.y }, { x: 23, y: 23 }, ...GUARD_PATROLS.flat()];
  let attempts = 0;
  while (graves.length < 84 && attempts < 900) {
    attempts++;
    const x = 3 + rnd() * (SIZE - 6), y = 3 + rnd() * (SIZE - 6);
    if (blocked(x, y)) continue;
    if (tiles[Math.floor(y) * SIZE + Math.floor(x)] === TILE.PATH) continue;
    if (keepClear.some(p => dist(x, y, p.x, p.y) < 2.3)) continue;
    if (obstacles.some(o => x > o.x - 1 && x < o.x + o.w + 1 && y > o.y - 1 && y < o.y + o.h + 1)) continue;
    if (graves.some(g => dist(x, y, g.x, g.y) < 1.35)) continue;
    graves.push({ x, y, rot: (rnd() - 0.5) * 0.7, tilt: (rnd() - 0.5) * 0.35, big: rnd() < 0.22 });
  }

  // Dead trees
  const trees = [];
  attempts = 0;
  while (trees.length < 26 && attempts < 500) {
    attempts++;
    const x = 3 + rnd() * (SIZE - 6), y = 3 + rnd() * (SIZE - 6);
    if (blocked(x, y)) continue;
    if (tiles[Math.floor(y) * SIZE + Math.floor(x)] === TILE.PATH) continue;
    if (keepClear.some(p => dist(x, y, p.x, p.y) < 2.0)) continue;
    if (graves.some(g => dist(x, y, g.x, g.y) < 1.2)) continue;
    if (obstacles.some(o => x > o.x - 1 && x < o.x + o.w + 1 && y > o.y - 1 && y < o.y + o.h + 1)) continue;
    trees.push({ x, y, seed: rnd() * 1000, scale: 0.8 + rnd() * 0.5 });
  }

  // Puddles — reflective, slow you slightly, hide shimmer
  const puddles = [];
  attempts = 0;
  while (puddles.length < 14 && attempts < 400) {
    attempts++;
    const x = 5 + rnd() * (SIZE - 10), y = 5 + rnd() * (SIZE - 10);
    if (blocked(x, y)) continue;
    if (keepClear.some(p => dist(x, y, p.x, p.y) < 1.6)) continue;
    puddles.push({ x, y, rx: 0.55 + rnd() * 0.65, ry: 0.35 + rnd() * 0.4 });
  }

  // Wandering wisps (ambient spirits)
  const wisps = [];
  for (let i = 0; i < 9; i++) wisps.push({ x: 8 + rnd() * 30, y: 8 + rnd() * 30, phase: rnd() * Math.PI * 2, speed: 0.14 + rnd() * 0.12 });

  return {
    tiles, shade, SIZE,
    graves, trees, puddles, wisps, obstacles,
    fogPatches: FOG_PATCHES.map(f => ({ ...f })),
    relics: RELIC_SPOTS.map((r, i) => ({ ...r, id: i, taken: false, revealed: false })),
    echoes: ECHO_SPOTS.map((e, i) => ({ ...e, id: i, taken: false })),
    epitaphs: EPITAPHS.map((e, i) => ({ ...e, id: i, read: false })),
    bells: BELL_SPOTS.map((b, i) => ({ ...b, id: i, cooldown: 0, ringT: -10 })),
    guards: GUARD_PATROLS.map((wp, i) => ({
      id: i, waypoints: wp.map(p => ({ ...p })),
      x: wp[0].x, y: wp[0].y, wpIndex: 1, angle: 0,
      state: 'patrol',            // patrol | suspicious | investigate
      investigateX: 0, investigateY: 0, pauseT: 0, speed: 1.55 + i * 0.12,
    })),
    spawn: { ...SPONSOR },
    barge: { ...BARGE },
    plaza: { x: 23, y: 23 },
  };
}

// Is this world position inside a fog bank? (hidden more easily)
export function inFog(world, x, y) {
  return world.fogPatches.some(f => dist(x, y, f.x, f.y) < f.r);
}

// Circle vs tile-void + obstacle collision. Returns corrected {x,y}.
export function resolveCollision(world, x, y, radius) {
  // Island bounds: stay off void
  for (let iter = 0; iter < 3; iter++) {
    const tx = Math.floor(x), ty = Math.floor(y);
    // check 3x3 neighbourhood for void tiles
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = tx + dx, cy = ty + dy;
      const inBounds = cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE;
      const t = inBounds ? world.tiles[cy * SIZE + cx] : TILE.VOID;
      if (t !== TILE.VOID) continue;
      // push out of this void tile (treat as solid box)
      const nx = Math.max(cx, Math.min(x, cx + 1));
      const ny = Math.max(cy, Math.min(y, cy + 1));
      const ddx = x - nx, ddy = y - ny;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) || 0.001;
        const push = (radius - d) / d;
        x += ddx * push; y += ddy * push;
      }
    }
    // rectangular obstacles
    for (const o of world.obstacles) {
      const nx = Math.max(o.x, Math.min(x, o.x + o.w));
      const ny = Math.max(o.y, Math.min(y, o.y + o.h));
      const ddx = x - nx, ddy = y - ny;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) || 0.001;
        const push = (radius - d) / d;
        x += ddx * push; y += ddy * push;
      }
    }
    // graves as small cylinders
    for (const g of world.graves) {
      const ddx = x - g.x, ddy = y - g.y;
      const rr = radius + 0.28;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        x += (ddx / d) * (rr - d); y += (ddy / d) * (rr - d);
      }
    }
    for (const t of world.trees) {
      const ddx = x - t.x, ddy = y - t.y;
      const rr = radius + 0.24;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        x += (ddx / d) * (rr - d); y += (ddy / d) * (rr - d);
      }
    }
    for (const b of world.bells) {
      const ddx = x - b.x, ddy = y - b.y;
      const rr = radius + 0.3;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        x += (ddx / d) * (rr - d); y += (ddy / d) * (rr - d);
      }
    }
  }
  return { x, y };
}


// Named districts — environmental storytelling + HUD zone label
export function zoneAt(x, y) {
  if (x < 14 && y > 30) return 'THE LANDING';
  if (x < 16 && y < 18) return 'THE MIST HOLLOW';
  if (x >= 30 && y < 16) return 'THE OLD RELIQUARY';
  if (x >= 24 && y >= 26) return 'THE KING\'S MILE';
  if (x < 20 && y >= 18 && y <= 32) return 'THE WEEPING ROWS';
  return 'THE MIRROR PLAZA';
}

// Does segment (x,y)->(x2,y2) cross a sight-blocking obstacle? (cheap)
export function lineBlocked(world, x0, y0, x1, y1) {
  for (const o of world.obstacles) {
    if (segIntersectsRect(x0, y0, x1, y1, o.x, o.y, o.x + o.w, o.y + o.h)) return true;
  }
  return false;
}
function segIntersectsRect(x0, y0, x1, y1, rx0, ry0, rx1, ry1) {
  if (x0 >= rx0 && x0 <= rx1 && y0 >= ry0 && y0 <= ry1) return true;
  if (x1 >= rx0 && x1 <= rx1 && y1 >= ry0 && y1 <= ry1) return true;
  return segSeg(x0, y0, x1, y1, rx0, ry0, rx1, ry0) || segSeg(x0, y0, x1, y1, rx1, ry0, rx1, ry1)
      || segSeg(x0, y0, x1, y1, rx1, ry1, rx0, ry1) || segSeg(x0, y0, x1, y1, rx0, ry1, rx0, ry0);
}
function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross(cx, cy, dx, dy, ax, ay), d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy), d4 = cross(ax, ay, bx, by, dx, dy);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function cross(ox, oy, ax, ay, bx, by) { return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox); }
