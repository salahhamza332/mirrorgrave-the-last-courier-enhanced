// Mirrorgrave — isometric renderer. Original vector art, violet/teal/brass palette.
import { SIZE, TILE, inFog } from './world.js';

export const TILE_W = 64, TILE_H = 32;
const isoX = (x, y) => (x - y) * (TILE_W / 2);
const isoY = (x, y) => (x + y) * (TILE_H / 2);

let camX = 0, camY = 0, shake = 0;
export function addShake(s) { shake = Math.max(shake, s); }
export function snapCamera(x, y) {
  camX = isoX(x, y) - 640;
  camY = isoY(x, y) - 360 + 30;
}
export function worldToScreen(x, y) {
  return { x: isoX(x, y) - camX, y: isoY(x, y) - camY };
}

export function render(ctx, world, state, time) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  // Camera follows the courier with a soft dead-zone feel
  const px = isoX(state.player.x, state.player.y), py = isoY(state.player.x, state.player.y);
  camX += (px - W / 2 - camX) * 0.12;
  camY += (py - H / 2 + 30 - camY) * 0.12;
  if (shake > 0.2) {
    camX += (Math.random() - 0.5) * shake;
    camY += (Math.random() - 0.5) * shake;
    shake *= 0.88;
  }

  drawSky(ctx, W, H, time);

  // --- Tiles ---
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = world.tiles[y * SIZE + x];
      if (t === TILE.VOID) continue;
      drawTile(ctx, world, x, y, t, time);
    }
  }

  // Cliff faces on island edge (2.5D extrusion into the sky-abyss)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = world.tiles[y * SIZE + x];
      if (t === TILE.VOID) continue;
      const s = worldToScreen(x + 0.5, y + 0.5);
      drawCliffIfEdge(ctx, world, x, y, s);
    }
  }

  // Puddles (under entities)
  for (const p of world.puddles) drawPuddle(ctx, p, time);

  // Epitaphs (always faintly visible) and lantern-revealed echoes
  for (const ep of world.epitaphs) drawEpitaph(ctx, ep, time);
  if (state.lanternOn) for (const ec of world.echoes) if (!ec.taken) drawEcho(ctx, ec, time);

  // Lantern-revealed rune path to nearest unclaimed relic
  if (state.lanternOn) drawRunePath(ctx, world, state, time);

  // --- Depth-sorted entities ---
  const drawables = [];
  for (const g of world.graves) drawables.push({ depth: g.x + g.y, kind: 'grave', o: g });
  for (const t of world.trees) drawables.push({ depth: t.x + t.y, kind: 'tree', o: t });
  for (const o of world.obstacles) drawables.push({ depth: o.x + o.y + o.w + o.h - 0.01, kind: 'mausoleum', o });
  for (const b of world.bells) drawables.push({ depth: b.x + b.y, kind: 'bell', o: b });
  for (const r of world.relics) if (!r.taken) drawables.push({ depth: r.x + r.y, kind: 'relic', o: r });
  drawables.push({ depth: world.barge.x + world.barge.y, kind: 'barge', o: world.barge });
  for (const g of world.guards) drawables.push({ depth: g.x + g.y, kind: 'guard', o: g });
  drawables.push({ depth: state.player.x + state.player.y, kind: 'player', o: state.player });
  for (const w of world.wisps) drawables.push({ depth: w.x + w.y, kind: 'wisp', o: w });
  drawables.sort((a, b) => a.depth - b.depth);

  // Guard vision cones (ground decals, under sprites but over tiles)
  for (const g of world.guards) drawVisionCone(ctx, g, state);

  for (const d of drawables) {
    switch (d.kind) {
      case 'grave': drawGrave(ctx, d.o); break;
      case 'tree': drawTree(ctx, d.o, time); break;
      case 'mausoleum': drawMausoleum(ctx, d.o); break;
      case 'bell': drawBell(ctx, d.o, time); break;
      case 'relic': drawRelic(ctx, d.o, state, time); break;
      case 'barge': drawBarge(ctx, d.o, state, time); break;
      case 'guard': drawGuard(ctx, d.o, time); break;
      case 'player': drawPlayer(ctx, d.o, state, time); break;
      case 'wisp': drawWisp(ctx, d.o, time); break;
    }
  }

  // Fog banks above the world, soft and luminous
  for (const f of world.fogPatches) drawFogPatch(ctx, f, time);

  // --- Darkness & light ---
  drawDarkness(ctx, W, H, world, state, time);

  // Vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(5,3,10,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawSky(ctx, W, H, time) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#120e24');
  g.addColorStop(0.45, '#171130');
  g.addColorStop(0.8, '#0d0a12');
  g.addColorStop(1, '#0d0a12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Moon with halo
  const mx = W * 0.82, my = H * 0.16;
  const halo = ctx.createRadialGradient(mx, my, 8, mx, my, 130);
  halo.addColorStop(0, 'rgba(232,227,240,0.5)');
  halo.addColorStop(0.25, 'rgba(184,167,232,0.16)');
  halo.addColorStop(1, 'rgba(184,167,232,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 140, my - 140, 280, 280);
  ctx.fillStyle = '#e8e3f0';
  ctx.beginPath(); ctx.arc(mx, my, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#120e24';
  ctx.beginPath(); ctx.arc(mx - 9, my - 4, 22, 0, Math.PI * 2); ctx.fill(); // crescent

  // Stars (deterministic twinkle)
  ctx.save();
  for (let i = 0; i < 90; i++) {
    const sx = (i * 733.13) % W, sy = ((i * 389.7) % (H * 0.5));
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 1.7 + i * 2.1));
    ctx.globalAlpha = tw * 0.8;
    ctx.fillStyle = i % 7 === 0 ? '#7de8d8' : '#e8e3f0';
    ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1.3, i % 5 === 0 ? 2 : 1.3);
  }
  ctx.restore();

  // Distant floating isles, silhouetted
  const isles = [
    { x: 0.12, y: 0.30, s: 60, drift: 0.9 },
    { x: 0.34, y: 0.13, s: 34, drift: 1.4 },
    { x: 0.62, y: 0.34, s: 46, drift: 0.7 },
    { x: 0.93, y: 0.42, s: 28, drift: 1.1 },
  ];
  for (const isle of isles) {
    const ix = isle.x * W, iy = isle.y * H + Math.sin(time * 0.4 * isle.drift + isle.x * 9) * 5;
    ctx.fillStyle = 'rgba(30, 23, 52, 0.9)';
    ctx.beginPath();
    ctx.moveTo(ix - isle.s, iy);
    ctx.quadraticCurveTo(ix, iy - isle.s * 0.42, ix + isle.s, iy);
    ctx.quadraticCurveTo(ix + isle.s * 0.5, iy + isle.s * 0.18, ix, iy + isle.s * 0.72);
    ctx.quadraticCurveTo(ix - isle.s * 0.5, iy + isle.s * 0.18, ix - isle.s, iy);
    ctx.fill();
    // tiny dead tree on the isle
    ctx.strokeStyle = 'rgba(30,23,52,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ix, iy - isle.s * 0.34); ctx.lineTo(ix + 4, iy - isle.s * 0.72);
    ctx.moveTo(ix + 3, iy - isle.s * 0.55); ctx.lineTo(ix + 12, iy - isle.s * 0.66);
    ctx.moveTo(ix + 2, iy - isle.s * 0.62); ctx.lineTo(ix - 7, iy - isle.s * 0.78);
    ctx.stroke();
  }
}

function drawTile(ctx, world, x, y, t, time) {
  const s = worldToScreen(x + 0.5, y + 0.5);
  const shade = world.shade[y * SIZE + x];
  const hw = TILE_W / 2, hh = TILE_H / 2;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - hh);
  ctx.lineTo(s.x + hw, s.y);
  ctx.lineTo(s.x, s.y + hh);
  ctx.lineTo(s.x - hw, s.y);
  ctx.closePath();

  if (t === TILE.GRASS) {
    const v = 0.75 + shade * 0.5;
    ctx.fillStyle = `rgb(${Math.floor(54 * v)},${Math.floor(48 * v)},${Math.floor(78 * v)})`;
  } else if (t === TILE.PATH) {
    const v = 0.8 + shade * 0.45;
    ctx.fillStyle = `rgb(${Math.floor(96 * v)},${Math.floor(86 * v)},${Math.floor(122 * v)})`;
  } else { // STONE plaza
    const v = 0.85 + shade * 0.4;
    ctx.fillStyle = `rgb(${Math.floor(124 * v)},${Math.floor(114 * v)},${Math.floor(156 * v)})`;
  }
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,8,18,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Stone seams on plaza & paths
  if (t !== TILE.GRASS && shade > 0.55) {
    ctx.strokeStyle = 'rgba(16,12,26,0.5)';
    ctx.beginPath();
    ctx.moveTo(s.x - hw * 0.5, s.y - hh * 0.5);
    ctx.lineTo(s.x + hw * 0.5, s.y + hh * 0.5);
    ctx.stroke();
  }
  // Faint grass sprigs
  if (t === TILE.GRASS && shade > 0.72) {
    ctx.strokeStyle = 'rgba(90, 84, 140, 0.5)';
    ctx.lineWidth = 1;
    const gx = s.x + (shade - 0.72) * 90 - 14, gy = s.y + ((shade * 997) % 1 - 0.5) * 10;
    ctx.beginPath();
    ctx.moveTo(gx, gy); ctx.lineTo(gx + 1.5, gy - 5);
    ctx.moveTo(gx + 4, gy + 1); ctx.lineTo(gx + 5.5, gy - 4);
    ctx.stroke();
  }
}

function drawCliffIfEdge(ctx, world, x, y, s) {
  const hw = TILE_W / 2, hh = TILE_H / 2;
  const drop = 46;
  const at = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) return TILE.VOID;
    return world.tiles[ty * SIZE + tx];
  };
  // South-east face (towards viewer-right)
  if (at(x, y + 1) === TILE.VOID || at(x + 1, y) === TILE.VOID) {
    ctx.beginPath();
    ctx.moveTo(s.x - hw, s.y);
    ctx.lineTo(s.x, s.y + hh);
    ctx.lineTo(s.x, s.y + hh + drop);
    ctx.lineTo(s.x - hw, s.y + drop);
    ctx.closePath();
    ctx.fillStyle = '#191325';
    ctx.fill();
  }
  if (at(x + 1, y) === TILE.VOID) {
    ctx.beginPath();
    ctx.moveTo(s.x + hw, s.y);
    ctx.lineTo(s.x, s.y + hh);
    ctx.lineTo(s.x, s.y + hh + drop);
    ctx.lineTo(s.x + hw, s.y + drop);
    ctx.closePath();
    ctx.fillStyle = '#221a30';
    ctx.fill();
  }
  // Hanging roots & moss on the cliff
  if (at(x, y + 1) === TILE.VOID && (x * 31 + y * 17) % 5 === 0) {
    ctx.strokeStyle = 'rgba(60,52,88,0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s.x - hw * 0.6, s.y + drop * 0.5);
    ctx.quadraticCurveTo(s.x - hw * 0.55, s.y + drop * 0.9, s.x - hw * 0.62, s.y + drop + 8);
    ctx.stroke();
  }
}

function drawPuddle(ctx, p, time) {
  const s = worldToScreen(p.x, p.y);
  const wob = 1 + Math.sin(time * 1.3 + p.x * 7) * 0.03;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, p.rx * TILE_W * 0.62 * wob);
  g.addColorStop(0, 'rgba(125, 232, 216, 0.5)');
  g.addColorStop(0.55, 'rgba(70, 110, 130, 0.55)');
  g.addColorStop(1, 'rgba(40, 34, 66, 0.15)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, p.rx * TILE_W * 0.62 * wob, 0, Math.PI * 2); ctx.fill();
  // Moon glint on the water
  ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 2.1 + p.y * 5);
  ctx.fillStyle = 'rgba(232,227,240,0.55)';
  ctx.beginPath(); ctx.ellipse(-p.rx * 10, -2, 6, 2.4, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawRunePath(ctx, world, state, time) {
  // A faint teal rune trail toward the nearest unclaimed relic — lantern light reveals it.
  const target = world.relics.filter(r => !r.taken).sort((a, b) =>
    Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
  if (!target) return;
  const steps = 26;
  ctx.save();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (t > 0.92) break;
    const x = state.player.x + (target.x - state.player.x) * t;
    const y = state.player.y + (target.y - state.player.y) * t;
    const s = worldToScreen(x, y);
    const pulse = 0.35 + 0.3 * Math.sin(time * 3 - i * 0.55);
    ctx.globalAlpha = pulse * (1 - t * 0.6);
    ctx.fillStyle = '#7de8d8';
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }
  ctx.restore();
}

function drawShadow(ctx, sx, sy, rx, ry, alpha = 0.4) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#05030a';
  ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawGrave(ctx, g) {
  const s = worldToScreen(g.x, g.y);
  const k = g.big ? 1.3 : 1;
  drawShadow(ctx, s.x, s.y + 2, 13 * k, 6 * k, 0.45);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(g.rot * 0.2);
  // Slab
  ctx.fillStyle = '#4c4460';
  ctx.beginPath();
  ctx.moveTo(-9 * k, 0); ctx.lineTo(-9 * k, -16 * k);
  ctx.quadraticCurveTo(0, -24 * k, 9 * k, -16 * k);
  ctx.lineTo(9 * k, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5d5378';
  ctx.beginPath();
  ctx.moveTo(-9 * k, 0); ctx.lineTo(-9 * k, -6 * k); ctx.lineTo(9 * k, -6 * k); ctx.lineTo(9 * k, 0); ctx.closePath(); ctx.fill();
  // Cross carving
  ctx.strokeStyle = '#2c2538';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -18 * k); ctx.lineTo(0, -8 * k);
  ctx.moveTo(-4 * k, -14 * k); ctx.lineTo(4 * k, -14 * k);
  ctx.stroke();
  ctx.restore();
}

function drawTree(ctx, t, time) {
  const s = worldToScreen(t.x, t.y);
  const k = t.scale;
  drawShadow(ctx, s.x, s.y + 2, 12 * k, 5.5 * k, 0.4);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.strokeStyle = '#241c30';
  ctx.lineCap = 'round';
  const sway = Math.sin(time * 0.9 + t.seed) * 1.5;
  ctx.lineWidth = 4.6 * k;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-3 * k, -18 * k, sway * 0.4, -34 * k); ctx.stroke();
  ctx.lineWidth = 2.6 * k;
  const branches = [ [-2, -16, -13, -26], [-1, -22, 11, -31], [1, -28, -8, -40], [sway * 0.4, -34, 13, -44] ];
  for (const [x0, y0, x1, y1] of branches) {
    ctx.beginPath(); ctx.moveTo(x0 * k, y0 * k); ctx.quadraticCurveTo((x0 + x1) / 2 * k, (y0 + y1) / 2 * k - 2, x1 * k + sway * 0.4, y1 * k); ctx.stroke();
  }
  ctx.restore();
}

function drawMausoleum(ctx, o) {
  const near = worldToScreen(o.x + o.w / 2, o.y + o.h / 2);
  const s0 = worldToScreen(o.x, o.y), s1 = worldToScreen(o.x + o.w, o.y), s2 = worldToScreen(o.x + o.w, o.y + o.h), s3 = worldToScreen(o.x, o.y + o.h);
  const hgt = 34 + o.w * 4;
  drawShadow(ctx, near.x, near.y + 4, (o.w + o.h) * 22, (o.w + o.h) * 9, 0.5);
  // Walls
  ctx.beginPath();
  ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s2.x, s2.y - hgt); ctx.lineTo(s1.x, s1.y - hgt); ctx.closePath();
  ctx.fillStyle = '#332b47'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(s3.x, s3.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s2.x, s2.y - hgt); ctx.lineTo(s3.x, s3.y - hgt); ctx.closePath();
  ctx.fillStyle = '#2a2338'; ctx.fill();
  // Roof slab
  ctx.beginPath();
  ctx.moveTo(s0.x, s0.y - hgt); ctx.lineTo(s1.x, s1.y - hgt); ctx.lineTo(s2.x, s2.y - hgt); ctx.lineTo(s3.x, s3.y - hgt); ctx.closePath();
  ctx.fillStyle = '#453c5c'; ctx.fill();
  ctx.strokeStyle = '#57506f'; ctx.lineWidth = 1.4; ctx.stroke();
  // Door + brass sigil
  const door = worldToScreen(o.x + o.w / 2, o.y + o.h);
  ctx.fillStyle = '#14101f';
  ctx.fillRect(door.x - 9, door.y - hgt + 6, 18, hgt - 6);
  ctx.strokeStyle = '#8a6f33'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(door.x, door.y - hgt / 2, 4.6, 0, Math.PI * 2); ctx.stroke();
  // Corner finials
  for (const [cx, cy] of [[s0.x, s0.y], [s1.x, s1.y], [s2.x, s2.y], [s3.x, s3.y]]) {
    ctx.fillStyle = '#57506f';
    ctx.beginPath(); ctx.moveTo(cx, cy - hgt - 9); ctx.lineTo(cx + 3.4, cy - hgt); ctx.lineTo(cx - 3.4, cy - hgt); ctx.closePath(); ctx.fill();
  }
}

function drawBell(ctx, b, time) {
  const s = worldToScreen(b.x, b.y);
  drawShadow(ctx, s.x, s.y + 2, 11, 5, 0.4);
  ctx.save();
  ctx.translate(s.x, s.y);
  // Stone posts
  ctx.fillStyle = '#443c56';
  ctx.fillRect(-8, -30, 4.6, 30);
  ctx.fillRect(3.4, -30, 4.6, 30);
  // Crossbeam
  ctx.fillStyle = '#554c6b';
  ctx.fillRect(-11, -34, 22, 4.6);
  // Bell (brass), swinging if recently rung
  const sinceRing = time - (b.ringT ?? -10);
  const swing = sinceRing < 2.5 ? Math.sin(sinceRing * 11) * Math.exp(-sinceRing * 1.6) * 0.6 : 0;
  ctx.save();
  ctx.translate(0, -29);
  ctx.rotate(swing);
  const bg = ctx.createLinearGradient(-5, 0, 5, 0);
  bg.addColorStop(0, '#8a6f33'); bg.addColorStop(0.5, '#ecd28a'); bg.addColorStop(1, '#8a6f33');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-5.4, 0); ctx.quadraticCurveTo(-6.6, -8, 0, -9.4); ctx.quadraticCurveTo(6.6, -8, 5.4, 0);
  ctx.lineTo(7, 2.4); ctx.lineTo(-7, 2.4); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  // Cooldown shimmer
  if (b.cooldown > 0) {
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(time * 4);
    ctx.fillStyle = '#7de8d8';
    ctx.beginPath(); ctx.arc(s.x, s.y - 28, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawRelic(ctx, r, state, time) {
  const s = worldToScreen(r.x, r.y);
  drawShadow(ctx, s.x, s.y + 2, 12, 5.5, 0.4);
  // Pedestal grave
  ctx.fillStyle = '#3d3550';
  ctx.beginPath();
  ctx.moveTo(-11, 0); ctx.lineTo(-11, -13); ctx.lineTo(11, -13); ctx.lineTo(11, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4c4364';
  ctx.beginPath();
  ctx.moveTo(-13, -13); ctx.lineTo(13, -13); ctx.lineTo(11, -17); ctx.lineTo(-11, -17); ctx.closePath(); ctx.fill();

  const near = Math.hypot(state.player.x - r.x, state.player.y - r.y) < 2.2;
  let revealed = state.lanternOn || near;
  if (r.puzzle === 'reveal') revealed = r.revealed || near;
  if (revealed) {
    // Floating relic — faceted gem
    const bob = Math.sin(time * 1.8 + r.id * 2) * 3;
    const ry = -30 + bob;
    const glow = ctx.createRadialGradient(s.x, s.y + ry, 1, s.x, s.y + ry, 34);
    glow.addColorStop(0, 'rgba(125,232,216,0.85)');
    glow.addColorStop(0.4, 'rgba(125,232,216,0.22)');
    glow.addColorStop(1, 'rgba(125,232,216,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(s.x - 36, s.y + ry - 36, 72, 72);
    ctx.save();
    ctx.translate(s.x, s.y + ry);
    ctx.rotate(Math.PI / 4 + Math.sin(time * 0.9 + r.id) * 0.2);
    const gg = ctx.createLinearGradient(-6, -6, 6, 6);
    gg.addColorStop(0, '#c9fff4'); gg.addColorStop(0.5, '#4fd6c0'); gg.addColorStop(1, '#1d6f66');
    ctx.fillStyle = gg;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
    // Sparkles
    for (let i = 0; i < 5; i++) {
      const a = time * 1.5 + i * (Math.PI * 2 / 5) + r.id;
      const sx = s.x + Math.cos(a) * 12, sy = s.y + ry + Math.sin(a * 1.3) * 7;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 3 + i * 2);
      ctx.fillStyle = '#eafffb';
      ctx.fillRect(sx, sy, 1.8, 1.8);
    }
    ctx.globalAlpha = 1;
  } else {
    // Dormant stone — the unwary walk past
    ctx.fillStyle = '#57506f';
    ctx.save();
    ctx.translate(s.x, s.y - 22);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
  }
  // The Pale Ward — two bells must toll before the seal breaks
  if (r.puzzle === 'ward' && !r.taken && (state.bellsTolled ?? 0) < 2) {
    const pulse = 0.6 + 0.4 * Math.sin(time * 2.4);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#b8a7e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y - 30, 17, 7.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = pulse * 0.5;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y - 30, 24, 10.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawEcho(ctx, ec, time) {
  const s = worldToScreen(ec.x, ec.y);
  const bob = Math.sin(time * 2.1 + ec.id * 2.4) * 4;
  const g = ctx.createRadialGradient(s.x, s.y - 26 + bob, 0.5, s.x, s.y - 26 + bob, 13);
  g.addColorStop(0, 'rgba(184,167,232,0.95)');
  g.addColorStop(0.4, 'rgba(125,232,216,0.4)');
  g.addColorStop(1, 'rgba(125,232,216,0)');
  ctx.fillStyle = g;
  ctx.fillRect(s.x - 13, s.y - 39 + bob, 26, 26);
  ctx.fillStyle = '#d9ccff';
  ctx.beginPath(); ctx.arc(s.x, s.y - 26 + bob, 2.6, 0, Math.PI * 2); ctx.fill();
}

function drawEpitaph(ctx, ep, time) {
  const s = worldToScreen(ep.x, ep.y);
  drawShadow(ctx, s.x, s.y + 2, 9, 4.4, 0.35);
  ctx.fillStyle = '#453c5c';
  ctx.beginPath();
  ctx.moveTo(-7, 0); ctx.lineTo(-7, -10); ctx.quadraticCurveTo(0, -15, 7, -10); ctx.lineTo(7, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = ep.read ? 'rgba(125,232,216,0.25)' : 'rgba(236,210,138,0.55)';
  ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(4, -6); ctx.moveTo(-4, -3.4); ctx.lineTo(4, -3.4); ctx.stroke();
}

function drawBarge(ctx, b, state, time) {
  const s = worldToScreen(b.x, b.y);
  const bob = Math.sin(time * 1.1) * 2.4;
  const ready = state.relicsCollected >= 3;
  ctx.save();
  ctx.translate(s.x, s.y + bob);
  // Hull — a dark crescent barge with brass prow
  ctx.fillStyle = '#241b2e';
  ctx.beginPath();
  ctx.moveTo(-64, 0); ctx.quadraticCurveTo(-56, 16, 0, 17); ctx.quadraticCurveTo(56, 16, 64, 0);
  ctx.lineTo(46, -6); ctx.lineTo(-46, -6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3a2f4a'; ctx.lineWidth = 1.5; ctx.stroke();
  // Prow lantern pole
  ctx.strokeStyle = '#554c2a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(46, -4); ctx.lineTo(46, -26); ctx.stroke();
  const lampGlow = ctx.createRadialGradient(46, -28, 1, 46, -28, 16);
  lampGlow.addColorStop(0, ready ? 'rgba(236,210,138,0.95)' : 'rgba(125,232,216,0.75)');
  lampGlow.addColorStop(1, 'rgba(236,210,138,0)');
  ctx.fillStyle = lampGlow; ctx.fillRect(28, -44, 36, 36);
  ctx.fillStyle = ready ? '#ecd28a' : '#7de8d8';
  ctx.beginPath(); ctx.arc(46, -27, 3.4, 0, Math.PI * 2); ctx.fill();
  // Mast + tattered violet sail
  ctx.strokeStyle = '#241c30'; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(-8, -52); ctx.stroke();
  ctx.fillStyle = 'rgba(111,99,155,0.85)';
  ctx.beginPath();
  ctx.moveTo(-8, -50); ctx.quadraticCurveTo(16 + Math.sin(time * 1.4) * 2, -40, -8, -26); ctx.closePath(); ctx.fill();
  ctx.restore();

  if (ready) {
    // Glowing gangplank
    const a = worldToScreen(6.9, 37.2);
    const pl = ctx.createLinearGradient(a.x, a.y, s.x, s.y);
    pl.addColorStop(0, 'rgba(236,210,138,0.05)');
    pl.addColorStop(1, 'rgba(236,210,138,0.55)');
    ctx.strokeStyle = pl; ctx.lineWidth = 7;
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(time * 2.6);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(s.x, s.y + bob - 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawGuard(ctx, g, time) {
  const s = worldToScreen(g.x, g.y);
  drawShadow(ctx, s.x, s.y + 2, 10, 5, 0.45);
  ctx.save();
  ctx.translate(s.x, s.y);
  const walk = g.pauseT > 0 ? 0 : Math.sin(time * 7 + g.id * 2) * 2;
  // Long coat
  ctx.fillStyle = '#2c2440';
  ctx.beginPath();
  ctx.moveTo(-6.4, -2); ctx.quadraticCurveTo(-7.6, -16, -4.6, -26 + walk * 0.3);
  ctx.lineTo(4.6, -26 + walk * 0.3); ctx.quadraticCurveTo(7.6, -16, 6.4, -2);
  ctx.quadraticCurveTo(0, 2.6, -6.4, -2); ctx.fill();
  // Belt brass
  ctx.fillStyle = '#8a6f33'; ctx.fillRect(-4.6, -13, 9.2, 2);
  // Head + wide hat
  ctx.fillStyle = '#1c1628';
  ctx.beginPath(); ctx.arc(0, -29 + walk * 0.3, 4.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#241c30';
  ctx.beginPath(); ctx.ellipse(0, -32 + walk * 0.3, 8.2, 2.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -33.4 + walk * 0.3, 4.6, 2.2, 0, Math.PI, 0); ctx.fill();
  // Teal watch-lantern in hand
  const lx = Math.cos(g.angle) * 8, ly = Math.sin(g.angle) * 4 - 14;
  const lg = ctx.createRadialGradient(lx, ly, 0.5, lx, ly, 12);
  lg.addColorStop(0, 'rgba(125,232,216,0.8)'); lg.addColorStop(1, 'rgba(125,232,216,0)');
  ctx.fillStyle = lg; ctx.fillRect(lx - 12, ly - 12, 24, 24);
  ctx.fillStyle = '#a9fff0'; ctx.beginPath(); ctx.arc(lx, ly, 1.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawVisionCone(ctx, g, state) {
  const s = worldToScreen(g.x, g.y);
  const range = 7.2 * 30; // px approx along iso axes
  const facing = g.angle;
  // Iso-project the cone by mapping world directions → screen vectors
  const dirX = Math.cos(facing), dirY = Math.sin(facing);
  const tip = worldToScreen(g.x + dirX * 6.4, g.y + dirY * 6.4);
  const left = worldToScreen(g.x + Math.cos(facing - 0.62) * 6.4, g.y + Math.sin(facing - 0.62) * 6.4);
  const right = worldToScreen(g.x + Math.cos(facing + 0.62) * 6.4, g.y + Math.sin(facing + 0.62) * 6.4);
  let heat = state.detection; // 0..1
  ctx.save();
  ctx.globalAlpha = 0.07 + heat * 0.22;
  ctx.fillStyle = heat > 0.66 ? '#e86a5a' : heat > 0.33 ? '#d8b25a' : '#7de8d8';
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(left.x, left.y);
  ctx.quadraticCurveTo(tip.x, tip.y - 10, right.x, right.y);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx, p, state, time) {
  const s = worldToScreen(p.x, p.y);
  drawShadow(ctx, s.x, s.y + 2, 9.5, 4.8, 0.45);
  ctx.save();
  ctx.translate(s.x, s.y);
  const hidden = state.hidden;
  ctx.globalAlpha = hidden ? 0.55 : 1;
  const walk = p.moving ? Math.sin(time * (p.sprinting ? 11 : 8)) * 2.1 : 0;
  const crouch = hidden ? 4.5 : 0;
  // Cloak — deep violet teardrop
  const cg = ctx.createLinearGradient(0, -34, 0, 2);
  cg.addColorStop(0, '#4a3d6e'); cg.addColorStop(0.55, '#372c54'); cg.addColorStop(1, '#241c38');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(-6.6, -1); ctx.quadraticCurveTo(-8.2, -13, -4.8, -23 + walk * 0.4 + crouch);
  ctx.quadraticCurveTo(0, -28 + crouch, 4.8, -23 + walk * 0.4 + crouch);
  ctx.quadraticCurveTo(8.2, -13, 6.6, -1);
  ctx.quadraticCurveTo(0, 3.4, -6.6, -1); ctx.fill();
  // Brass satchel strap
  ctx.strokeStyle = '#a8843c'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-4.4, -15 + crouch); ctx.lineTo(4.4, -8 + crouch); ctx.stroke();
  // Hood + shadowed face
  ctx.fillStyle = '#2c233f';
  ctx.beginPath(); ctx.arc(0, -24.5 + crouch + walk * 0.3, 4.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0d0a12';
  ctx.beginPath(); ctx.arc(0, -23.6 + crouch + walk * 0.3, 3.1, 0, Math.PI * 2); ctx.fill();
  // Eyes catch the light
  ctx.fillStyle = '#7de8d8';
  ctx.globalAlpha = (hidden ? 0.55 : 1) * (0.75 + 0.25 * Math.sin(time * 2.3));
  ctx.fillRect(-1.9, -24.2 + crouch + walk * 0.3, 1.1, 0.9);
  ctx.fillRect(0.9, -24.2 + crouch + walk * 0.3, 1.1, 0.9);
  ctx.globalAlpha = hidden ? 0.55 : 1;
  // Lantern in hand (when lit)
  if (state.lanternOn) {
    const lx = 7.6, ly = -12 + crouch;
    const lg = ctx.createRadialGradient(lx, ly, 0.5, lx, ly, 11);
    lg.addColorStop(0, 'rgba(236,210,138,0.95)'); lg.addColorStop(1, 'rgba(236,210,138,0)');
    ctx.fillStyle = lg; ctx.fillRect(lx - 11, ly - 11, 22, 22);
    ctx.fillStyle = '#f5e2a0'; ctx.beginPath(); ctx.arc(lx, ly, 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6f5620'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx, ly - 2); ctx.lineTo(lx, ly - 5); ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawWisp(ctx, w, time) {
  const s = worldToScreen(w.x, w.y);
  const bob = Math.sin(time * 1.6 + w.phase) * 6;
  const g = ctx.createRadialGradient(s.x, s.y - 16 + bob, 0.5, s.x, s.y - 16 + bob, 9);
  g.addColorStop(0, 'rgba(125,232,216,0.8)');
  g.addColorStop(1, 'rgba(125,232,216,0)');
  ctx.fillStyle = g;
  ctx.fillRect(s.x - 9, s.y - 25 + bob, 18, 18);
}

function drawFogPatch(ctx, f, time) {
  const s = worldToScreen(f.x, f.y);
  const r = f.r * 34;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const off = Math.sin(time * 0.32 + i * 2.1 + f.x) * r * 0.16;
    const g = ctx.createRadialGradient(s.x + off, s.y - 8, 4, s.x + off, s.y - 8, r);
    g.addColorStop(0, 'rgba(178, 172, 214, 0.34)');
    g.addColorStop(0.7, 'rgba(150, 143, 196, 0.14)');
    g.addColorStop(1, 'rgba(150,143,196,0)');
    ctx.fillStyle = g;
    ctx.fillRect(s.x + off - r, s.y - 8 - r, r * 2, r * 2);
  }
  ctx.restore();
}

function drawDarkness(ctx, W, H, world, state, time) {
  // Offscreen darkness with light holes punched out
  const dark = getDarkCanvas(W, H);
  const dctx = dark.getContext('2d');
  dctx.clearRect(0, 0, W, H);
  dctx.fillStyle = 'rgba(7, 5, 14, 0.47)';
  dctx.fillRect(0, 0, W, H);
  dctx.globalCompositeOperation = 'destination-out';

  const punch = (sx, sy, r, strength) => {
    const g = dctx.createRadialGradient(sx, sy, r * 0.08, sx, sy, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.7, `rgba(0,0,0,${strength * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    dctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  };

  const flick = 1 + Math.sin(time * 9.3) * 0.035 + Math.sin(time * 23.7) * 0.02;
  const ps = worldToScreen(state.player.x, state.player.y);
  if (state.lanternOn) punch(ps.x, ps.y - 12, 205 * flick, 0.96);
  else punch(ps.x, ps.y - 12, 96 * flick, 0.72);

  for (const g of world.guards) {
    const s = worldToScreen(g.x, g.y);
    punch(s.x, s.y - 14, 88 * (1 + Math.sin(time * 7 + g.id) * 0.04), 0.66);
  }
  for (const b of world.bells) {
    const s = worldToScreen(b.x, b.y);
    punch(s.x, s.y - 26, 52, 0.4);
  }
  const bs = worldToScreen(world.barge.x, world.barge.y);
  punch(bs.x + 46, bs.y - 27, 90, 0.6);
  if (state.lanternOn) {
    for (const r of world.relics) {
      if (r.taken) continue;
      const s = worldToScreen(r.x, r.y);
      punch(s.x, s.y - 26, 70, 0.55);
    }
  }
  dctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(dark, 0, 0);
}
let _dark = null;
function getDarkCanvas(W, H) {
  if (!_dark) { _dark = document.createElement('canvas'); _dark.width = W; _dark.height = H; }
  return _dark;
}
