const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('8123'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej, m }); ws.send(JSON.stringify({ id: mid, method: m, params: p })); });
ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const { res, rej, m } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(m + ': ' + JSON.stringify(msg.error))) : res(msg.result); } };
const consoleMsgs = [];
await new Promise(r => ws.onopen = r);
ws.addEventListener?.('close', () => {});
await send('Runtime.enable'); await send('Page.enable');
// Runtime.consoleAPICalled subscription
const orig = ws.onmessage;
ws.onmessage = (ev) => { const msg = JSON.parse(ev.data);
  if (msg.method === 'Runtime.consoleAPICalled') consoleMsgs.push(msg.params.type + ': ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (msg.method === 'Runtime.exceptionThrown') consoleMsgs.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails));
  orig(ev); };
const evaluate = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const viewport = async (w, h) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(250); };
const key = async (code) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code }); await sleep(50); await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code }); };
const shot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); const fs = await import('node:fs'); fs.writeFileSync(name, Buffer.from(data, 'base64')); console.log('shot', name); };

// --- 1440x900 title layout ---
await send('Page.reload', { ignoreCache: true }); await sleep(900);
await viewport(1440, 900);
await shot('/home/ubuntu/.openclaw/workspace/mirrorgrave-enhanced/after-1440x900.png');
const overflow1440 = await evaluate(`(() => { const el = document.querySelector('.title-inner'); const r = el.getBoundingClientRect(); return { w: r.width, x: r.x, right: r.right, win: innerWidth }; })()`);
console.log('title rect 1440:', JSON.stringify(overflow1440));

// --- 1280x720 title layout ---
await viewport(1280, 720);
await shot('/home/ubuntu/.openclaw/workspace/mirrorgrave-enhanced/after-1280x720.png');
const overflow1280 = await evaluate(`(() => { const el = document.querySelector('.title-inner'); const r = el.getBoundingClientRect(); return { w: r.width, x: r.x, right: r.right, win: innerWidth }; })()`);
console.log('title rect 1280:', JSON.stringify(overflow1280));

// --- Start game, check HUD visible in gameplay ---
await evaluate('document.getElementById("btn-start").click()');
await sleep(400);
console.log('HUD visible while playing:', await evaluate('!document.getElementById("hud").classList.contains("hidden")'));
const toastRect = async () => evaluate(`(() => { const t = document.getElementById('toast'); const r = t.getBoundingClientRect(); return { left: r.left, right: r.right, win: innerWidth, clipped: r.left < 0 || r.right > innerWidth, text: t.textContent }; })()`);
console.log('toast early:', JSON.stringify(await toastRect()));
await sleep(2500);
console.log('toast after 2.5s:', JSON.stringify(await toastRect()));

// --- Lantern energy: drain, SPENT, rekindle ---
await key('KeyE'); await sleep(300);
console.log('lantern on:', await evaluate('__mirrorgrave.lanternOn'), 'energy:', Math.round(await evaluate('__mirrorgrave.lanternEnergy')));
await evaluate('__mirrorgrave.lanternEnergy = 3'); await sleep(600); // should burn out
console.log('spent state:', JSON.stringify(await evaluate('({on: __mirrorgrave.lanternOn, energy: Math.round(__mirrorgrave.lanternEnergy), spent: __mirrorgrave.lanternSpent})')));
await key('KeyE'); await sleep(200); // attempt relight while spent — should refuse
console.log('relight while spent refused:', !(await evaluate('__mirrorgrave.lanternOn')));
await evaluate('__mirrorgrave.lanternEnergy = 40'); await sleep(100); // simulate rekindle threshold
console.log('after rekindle threshold:', JSON.stringify(await evaluate('({spent: __mirrorgrave.lanternSpent})')));

// --- Relic trials ---
await evaluate('__mirrorgrave.world.relics[0].x'); // chalice
await evaluate('__mirrorgrave.player.x = __mirrorgrave.world.relics[0].x; __mirrorgrave.player.y = __mirrorgrave.world.relics[0].y');
await key('KeyE'); await sleep(200);
console.log('chalice collected:', await evaluate('__mirrorgrave.relicsCollected'), '(expect 1)');
// sigil reveal
await evaluate('__mirrorgrave.lanternOn = true; __mirrorgrave.lanternEnergy = 90; __mirrorgrave.player.x = __mirrorgrave.world.relics[1].x; __mirrorgrave.player.y = __mirrorgrave.world.relics[1].y');
await sleep(300);
await evaluate('__mirrorgrave.lanternOn = false');
await key('KeyE'); await sleep(200);
console.log('sigil after reveal collected:', await evaluate('__mirrorgrave.relicsCollected'), '(expect 2)');
// ward without bells
await evaluate('__mirrorgrave.player.x = __mirrorgrave.world.relics[2].x; __mirrorgrave.player.y = __mirrorgrave.world.relics[2].y; __mirrorgrave.bellsTolled = 0');
await key('KeyE'); await sleep(200);
console.log('ward blocks:', await evaluate('__mirrorgrave.relicsCollected'), '(expect 2)');
for (const i of [0, 1]) { await evaluate(`(__mirrorgrave.player.x = __mirrorgrave.world.bells[${i}].x + 0.3, __mirrorgrave.player.y = __mirrorgrave.world.bells[${i}].y, __mirrorgrave.world.bells[${i}].cooldown = 0, true)`); await key('KeyE'); await sleep(200); }
await evaluate('__mirrorgrave.player.x = __mirrorgrave.world.relics[2].x; __mirrorgrave.player.y = __mirrorgrave.world.relics[2].y');
await key('KeyE'); await sleep(200);
console.log('ward after 2 bells collected:', await evaluate('__mirrorgrave.relicsCollected'), '(expect 3)');

// --- Victory + HUD hidden behind end screen ---
await evaluate('__mirrorgrave.player.x = __mirrorgrave.world.barge.x; __mirrorgrave.player.y = __mirrorgrave.world.barge.y;');
await key('KeyE'); await sleep(400);
console.log('mode:', await evaluate('__mirrorgrave.mode'), '(expect victory)');
console.log('HUD hidden on end screen:', await evaluate('document.getElementById("hud").classList.contains("hidden")'));

// --- Restart + defeat path ---
await key('KeyR'); await sleep(400);
await evaluate('__mirrorgrave.detection = 0.99; const g = __mirrorgrave.world.guards[0]; g.angle = Math.atan2(__mirrorgrave.player.y - g.y, __mirrorgrave.player.x - g.x); __mirrorgrave.player.x = g.x + 1.2; __mirrorgrave.player.y = g.y + 1.2; __mirrorgrave.lanternOn = true; __mirrorgrave.lanternEnergy = 80;');
await sleep(2200);
console.log('defeat mode:', await evaluate('__mirrorgrave.mode'), '(expect defeat)');
console.log('HUD hidden on defeat screen:', await evaluate('document.getElementById("hud").classList.contains("hidden")'));

console.log('CONSOLE:', JSON.stringify(consoleMsgs));
ws.close(); process.exit(0);
