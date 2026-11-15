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
const key = async (code) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code }); await sleep(50); await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code }); };
// Best score before reload
console.log('best before:', await evaluate('localStorage.getItem("mirrorgrave.best.v2")'));
// Reload and read again (persistence check)
await send('Page.reload', { ignoreCache: true }); await sleep(1200);
console.log('best after reload:', await evaluate('localStorage.getItem("mirrorgrave.best.v2")'));
console.log('title best shown:', await evaluate('document.getElementById("title-best").textContent'));
// Dawn-timer defeat: start, force timeLeft near 0
await evaluate('document.getElementById("btn-start").click()'); await sleep(300);
await evaluate('__mirrorgrave.timeLeft = 0.5');
await sleep(900);
console.log('mode after dawn:', await evaluate('__mirrorgrave.mode'), '(expect defeat)');
console.log('HUD hidden on dawn defeat:', await evaluate('document.getElementById("hud").classList.contains("hidden")'));
ws.close(); process.exit(0);
