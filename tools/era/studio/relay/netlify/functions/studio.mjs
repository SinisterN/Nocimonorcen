// Era Studio relay. The studio page can't call the routine API itself (it would need the routine's secret token,
// and the page can't make background requests anyway), so Send opens a tab on this function, which checks the
// studio key and the limits and then starts the studio routine. Nothing here reads the page's database: the
// choices are already saved there, and the routine reads them. The function only keeps small counters.
//
//   GET /api/send?u=<user>&d=<draft>&s=<send>&k=<STUDIO_KEY>   a requester's send (from the page)
//   GET /api/run?k=<OWNER_KEY>&why=<button|login|...>         the owner's "run now" (page button, PC login task)
//
// Environment (Netlify, hidden): STUDIO_KEY, OWNER_KEY, ROUTINE_ID (trig_...), ROUTINE_TOKEN (entered by the owner).
import { getStore } from '@netlify/blobs';

const DAILY_SENDS = 6;      // per requester per day, then the owner has to OK more (design: usage limits)
const HOURLY_FIRES = 25;    // the routine itself accepts 30 an hour; keep headroom for the owner's own runs
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const config = { path: ['/api/send', '/api/run'] };

export default async (req) => {
  const url = new URL(req.url);
  const q = (k) => url.searchParams.get(k) || '';
  const env = (k) => Netlify.env.get(k) || '';
  const store = getStore('studio-relay');
  const now = new Date();

  if (url.pathname === '/api/run') {
    if (!env('OWNER_KEY') || !same(q('k'), env('OWNER_KEY'))) return page(403, 'Not allowed', 'This link isn’t valid.');
    const why = /^[a-z_-]{1,20}$/.test(q('why')) ? q('why') : 'button';
    const r = await fire(env, store, now, `Era Studio owner run (${why}).`);
    if (why === 'login' && req.headers.get('accept')?.includes('application/json')) return Response.json(r, { status: r.ok ? 200 : 502 });
    return r.ok ? page(200, 'Studio started', 'The studio is picking up everything that’s queued.', r.session)
      : page(502, 'Couldn’t start the studio', r.text);
  }

  // a requester's send
  const [u, d, s] = [q('u'), q('d'), q('s')];
  if (!env('STUDIO_KEY') || !same(q('k'), env('STUDIO_KEY'))) return page(403, 'Not allowed', 'This link isn’t valid. Send again from the studio page.');
  if (![u, d, s].every((x) => ID.test(x))) return page(400, 'Something’s missing', 'This link is incomplete. Send again from the studio page.');

  if (await store.get(`sent/${s}`)) return page(200, 'Already sent', 'The studio already has this one. You can close this tab.');
  const day = now.toISOString().slice(0, 10);
  const dayKey = `day/${day}/${u}`;
  const count = Number(await store.get(dayKey)) || 0;
  await store.set(`sent/${s}`, JSON.stringify({ u, d, at: now.toISOString() }));
  await store.set(dayKey, String(count + 1));
  if (count >= DAILY_SENDS) {
    await flag(store, now, `${u} went over ${DAILY_SENDS} sends today (era ${d})`);
    return page(200, 'Saved: waiting for the owner',
      `Your choices are saved. You’ve sent ${DAILY_SENDS} times today, which is the daily limit, so the studio owner has to OK this one. It’s been flagged to them.`);
  }
  const r = await fire(env, store, now, `Era Studio send: user=${u} draft=${d} send=${s}`);
  if (r.ok) return page(200, 'Sent to the studio', 'The studio is starting. Your era page shows its progress; you can close this tab.');
  if (r.busy) return page(200, 'Saved: the studio is busy',
    'Your choices are saved. The studio has had a lot of requests this hour, so it picks yours up on its next run.');
  await store.delete(`sent/${s}`);  // let the requester retry this one
  await flag(store, now, `couldn’t start the studio for ${u} (era ${d}): ${r.text}`);
  return page(200, 'Saved: the studio didn’t start',
    'Your choices are saved, but the studio couldn’t be started just now. The owner has been flagged and it will be picked up on the next run.');
};

async function fire(env, store, now, text) {
  const hourKey = `hour/${now.toISOString().slice(0, 13)}`;
  const fires = Number(await store.get(hourKey)) || 0;
  if (fires >= HOURLY_FIRES) return { ok: false, busy: true, text: 'hourly limit reached' };
  if (!env('ROUTINE_ID') || !env('ROUTINE_TOKEN')) return { ok: false, text: 'the relay is not fully set up yet (routine id or token missing)' };
  await store.set(hourKey, String(fires + 1));
  try {
    const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${env('ROUTINE_ID')}/fire`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env('ROUTINE_TOKEN')}`, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, session: body.claude_code_session_url };
    if (res.status === 429) return { ok: false, busy: true, text: 'the routine’s hourly limit was reached' };
    return { ok: false, text: `the routine API answered ${res.status} ${body?.error?.type || ''}`.trim() };
  } catch (e) {
    return { ok: false, text: `couldn’t reach the routine API (${e.message})` };
  }
}

async function flag(store, now, text) {
  const flags = JSON.parse((await store.get('flags')) || '[]');
  flags.push({ at: now.toISOString(), text });
  await store.set('flags', JSON.stringify(flags.slice(-50)));
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function page(status, title, text, sessionUrl) {
  const ok = status === 200;
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
:root{--bg:#efe9e1;--panel:#fbf8f4;--ink:#2b1d12;--muted:#6f5e4f;--accent:#b5652a;--ok:#3f8a4a;--bad:#b4473a}
@media (prefers-color-scheme:dark){:root{--bg:#17120e;--panel:#221b15;--ink:#f3e9dc;--muted:#b9a68f;--accent:#e08a3c;--ok:#6cc07a;--bad:#ef7b6b;color-scheme:dark}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif;padding:16px;box-sizing:border-box}
main{background:var(--panel);border-radius:12px;padding:28px 24px;max-width:420px;text-align:center;display:grid;gap:12px;box-shadow:0 6px 24px rgb(0 0 0/.12)}
.mark{font-size:40px;line-height:1;color:${ok ? 'var(--ok)' : 'var(--bad)'}}h1{margin:0;font-size:22px}p{margin:0}small{color:var(--muted)}
button,a.b{font:700 15px system-ui;border-radius:8px;padding:9px 16px;border:2px solid var(--ink);background:none;color:var(--ink);cursor:pointer;justify-self:center;text-decoration:none}
</style><main><div class="mark" aria-hidden="true">${ok ? '✓' : '!'}</div><h1>${esc(title)}</h1><p>${esc(text)}</p>
${sessionUrl ? `<a class="b" href="${esc(sessionUrl)}" target="_blank" rel="noopener">Watch the run</a>` : ''}
<button type="button" onclick="window.close()">Close this tab</button><small>Nocimonorcen Era Studio</small></main></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
}
