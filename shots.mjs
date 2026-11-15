// Capture genuine in-game screenshots (title / play / victory)
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('8123'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej, m }); ws.send(JSON.stringify({ id: mid, method: m, params: p })); });
ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const { res, rej, m } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(m)) : res(msg.result); } };
await new Promise(r => ws.onopen = r);
await send('Runtime.enable'); await send('Page.enable');
const evaluate = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); const fs = await import('node:fs'); fs.writeFileSync(name, Buffer.from(data, 'base64')); console.log('shot', name); };
// Reload fresh to title
await send('Page.reload', { ignoreCache: true });
await sleep(1200);
// Title shot
await shot('/home/ubuntu/.openclaw/workspace/mirrorgrave-enhanced/screenshots/1-title.png');
// Start game, stage a cinematic gameplay moment near the Pale Lantern
await evaluate('document.getElementById("btn-start").click()');
await sleep(600);
await evaluate('(__mirrorgrave.world.relics[0].taken = true, __mirrorgrave.relicsCollected = 1, __mirrorgrave.player.x = 28.4, __mirrorgrave.player.y = 31.2, __mirrorgrave.lanternOn = true, __mirrorgrave.lanternEnergy = 95, __mirrorgrave.detection = 0.34, true)');
await sleep(700);
await shot('/home/ubuntu/.openclaw/workspace/mirrorgrave-enhanced/screenshots/2-play.png');
// Victory screen
await evaluate('(__mirrorgrave.world.relics.forEach(r => r.taken = true), __mirrorgrave.relicsCollected = 3, __mirrorgrave.player.x = __mirrorgrave.world.barge.x, __mirrorgrave.player.y = __mirrorgrave.world.barge.y, true)');
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyE', key: 'e' });
await sleep(60);
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyE', key: 'e' });
await sleep(800);
await shot('/home/ubuntu/.openclaw/workspace/mirrorgrave-enhanced/screenshots/3-victory.png');
console.log('mode:', await evaluate('__mirrorgrave.mode'));
ws.close(); process.exit(0);
