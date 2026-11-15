// QA driver for Mirrorgrave Enhanced via CDP
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('8123'));
if (!page) { console.error('no page target'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const consoleMsgs = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej, method });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej, method } = pending.get(msg.id); pending.delete(msg.id);
    if (msg.error) rej(new Error(method + ': ' + JSON.stringify(msg.error))); else res(msg.result);
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    consoleMsgs.push(msg.params.type + ': ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  } else if (msg.method === 'Runtime.exceptionThrown') {
    consoleMsgs.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails));
  }
};
await new Promise(r => ws.onopen = r);
await send('Runtime.enable');
await send('Page.enable');
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
const key = async (code) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code });
  await new Promise(r => setTimeout(r, 40));
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code });
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const fs = await import('node:fs');
  fs.writeFileSync(name, Buffer.from(data, 'base64'));
  console.log('shot', name);
};

console.log('mode@load:', await evaluate('window.__mirrorgrave.mode'));
await shot('/home/ubuntu/.openclaw/workspace/mirrorgrave-enhanced/qa-title.png');
await evaluate('document.getElementById("btn-start").click()');
await sleep(500);
console.log('mode@start:', await evaluate('window.__mirrorgrave.mode'));

// Movement
const p0 = await evaluate('({x: __mirrorgrave.player.x, y: __mirrorgrave.player.y})');
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w' });
await sleep(900);
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w' });
const p1 = await evaluate('({x: __mirrorgrave.player.x, y: __mirrorgrave.player.y})');
console.log('moved delta=', Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(2));

// Lantern energy drain/recharge
const e0 = await evaluate('__mirrorgrave.lanternEnergy');
await key('KeyE'); await sleep(1200);
const e1 = await evaluate('({energy: __mirrorgrave.lanternEnergy, on: __mirrorgrave.lanternOn})');
await key('KeyE'); await sleep(100); // lantern off
console.log('energy:', e0, '->', JSON.stringify(e1));

// Zone label
console.log('zone:', await evaluate('__mirrorgrave.zone'));

// Reveal-puzzle relic: Mirror Sigil should not be takeable before reveal
await evaluate('__mirrorgrave.world.relics[1].taken = false; __mirrorgrave.player.x = __mirrorgrave.world.relics[1].x; __mirrorgrave.player.y = __mirrorgrave.world.relics[1].y;');
const taken0 = await evaluate('__mirrorgrave.relicsCollected');
const lanternOff = await evaluate('(__mirrorgrave.lanternOn = false, true)');
await key('KeyE'); await sleep(250);
console.log('sigil without lantern: collected=', await evaluate('__mirrorgrave.relicsCollected'), '(expect unchanged)', 'reserved-e0=', taken0);
// Light lantern near it to reveal
await evaluate('__mirrorgrave.lanternOn = true; __mirrorgrave.lanternEnergy = 80;');
await sleep(800);
console.log('sigil revealed:', await evaluate('__mirrorgrave.world.relics[1].revealed'));
await evaluate('__mirrorgrave.lanternOn = false');
await key('KeyE'); await sleep(250);
console.log('sigil after reveal: collected=', await evaluate('__mirrorgrave.relicsCollected'), '(expect +1)');

// Ward relic: Pale Lantern should refuse before two bells
await evaluate('__mirrorgrave.world.relics[2].taken = false; __mirrorgrave.player.x = __mirrorgrave.world.relics[2].x; __mirrorgrave.player.y = __mirrorgrave.world.relics[2].y; __mirrorgrave.bellsTolled = 0;');
await key('KeyE'); await sleep(250);
console.log('ward blocks: collected=', await evaluate('__mirrorgrave.relicsCollected'), '(expect unchanged)');
// Ring two bells (teleport + E), then take
for (const i of [0, 1]) {
  await evaluate(`(__mirrorgrave.player.x = __mirrorgrave.world.bells[${i}].x + 0.3, __mirrorgrave.player.y = __mirrorgrave.world.bells[${i}].y, __mirrorgrave.world.bells[${i}].cooldown = 0, true)`);
  await key('KeyE'); await sleep(250);
}
console.log('bellsTolled:', await evaluate('__mirrorgrave.bellsTolled'));
await evaluate('__mirrorgrave.player.x = __mirrorgrave.world.relics[2].x; __mirrorgrave.player.y = __mirrorgrave.world.relics[2].y;');
await key('KeyE'); await sleep(250);
console.log('ward after bells: collected=', await evaluate('__mirrorgrave.relicsCollected'), '(expect +1)');

// Open relic: Chalice
await evaluate('__mirrorgrave.world.relics[0].taken = false; __mirrorgrave.player.x = __mirrorgrave.world.relics[0].x; __mirrorgrave.player.y = __mirrorgrave.world.relics[0].y;');
await key('KeyE'); await sleep(250);
console.log('chalice: collected=', await evaluate('__mirrorgrave.relicsCollected'), 'score=', await evaluate('__mirrorgrave.score'));

// Echo collection (needs lantern)
await evaluate('__mirrorgrave.player.x = __mirrorgrave.world.echoes[0].x; __mirrorgrave.player.y = __mirrorgrave.world.echoes[0].y; __mirrorgrave.lanternOn = true; __mirrorgrave.lanternEnergy = 80;');
await sleep(400);
await key('KeyE'); await sleep(250);
console.log('echoes: secrets=', await evaluate('__mirrorgrave.secrets'), 'score=', await evaluate('__mirrorgrave.score'));

// Epitaph reading
await evaluate('__mirrorgrave.player.x = __mirrorgrave.world.epitaphs[0].x; __mirrorgrave.player.y = __mirrorgrave.world.epitaphs[0].y;');
await key('KeyE'); await sleep(250);
console.log('epitaph: secrets=', await evaluate('__mirrorgrave.secrets'));

// Bridge phase toggles
console.log('bridge phase t=0:', await evaluate('(window.__bridgeInfo = null, true)') && await evaluate('(() => { const w = window.__mirrorgrave.world; return (w.timeSec ?? 0).toFixed(1); })()'));

// Guard AI: put guard investigating toward player sprint noise is hard to force; instead check hearing state machine fields exist
console.log('guard states:', await evaluate('__mirrorgrave.world.guards.map(g => g.state).join(",")'));

// Defeat path
await evaluate('__mirrorgrave.detection = 0.99; const g = __mirrorgrave.world.guards[0]; g.angle = Math.atan2(__mirrorgrave.player.y - g.y, __mirrorgrave.player.x - g.x); __mirrorgrave.player.x = g.x + 1.2; __mirrorgrave.player.y = g.y + 1.2; __mirrorgrave.lanternOn = true; __mirrorgrave.lanternEnergy = 80;');
await sleep(2500);
console.log('mode after seen:', await evaluate('__mirrorgrave.mode'), '(expect defeat)');

// Restart
await key('KeyR'); await sleep(400);
console.log('after R:', await evaluate('({mode: __mirrorgrave.mode, relics: __mirrorgrave.relicsCollected, best: localStorage.getItem("mirrorgrave.best.v2")})'));

// Victory path
await evaluate('__mirrorgrave.world.relics.forEach(r => { r.taken = true; }); __mirrorgrave.relicsCollected = 3; __mirrorgrave.player.x = __mirrorgrave.world.barge.x; __mirrorgrave.player.y = __mirrorgrave.world.barge.y;');
await key('KeyE'); await sleep(400);
console.log('mode after barge:', await evaluate('__mirrorgrave.mode'), '(expect victory)');
console.log('best stored:', await evaluate('localStorage.getItem("mirrorgrave.best.v2")'));
await shot('/home/ubuntu/.openclaw/workspace/mirrorgrave-enhanced/qa-victory.png');
await key('KeyR'); await sleep(300);
console.log('after end R:', await evaluate('__mirrorgrave.mode'));

console.log('CONSOLE:', JSON.stringify(consoleMsgs, null, 1));
ws.close();
process.exit(0);
