// Lit Fits API — single edge function, routed by path: /functions/v1/api/<route>
import { authenticate, cors, HttpError, json } from './lib/core.ts';
import { itemProcess } from './routes/items.ts';
import { stylist } from './routes/stylist.ts';
import { complete, critique, nameLook, pack, pairings } from './routes/assist.ts';
import { buildTwin, render, renderUrl } from './routes/render.ts';
import { dna, trends } from './routes/style.ts';
import { bootstrap, clientLog, reshootMissing, wishlistConcept } from './routes/misc.ts';
import { lab } from './routes/lab.ts';

type Handler = (req: Request, caller: Awaited<ReturnType<typeof authenticate>>, route: string) => Promise<Response>;

const routes: Record<string, Handler> = {
  'item/process': itemProcess,
  'item/pairings': pairings,
  'stylist': stylist,
  'look/complete': complete,
  'look/name': nameLook,
  'look/critique': critique,
  'trip/pack': pack,
  'render': render,
  'render/urls': renderUrl,
  'twin/build': buildTwin,
  'style/trends': trends,
  'style/dna': dna,
  'wishlist/concept': wishlistConcept,
  'items/reshoot-missing': reshootMissing,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*?\/api\/?/, '').replace(/\/$/, '');
  try {
    if (route === 'health') return json({ ok: true, at: new Date().toISOString() });
    if (route === 'bootstrap') return await bootstrap(req);
    if (route === 'client/log') return await clientLog(req);
    // exports are AES-GCM encrypted with a key only the owner's tooling holds, so they can be served without auth
    if (route === 'lab/export') return await lab(req, { userId: '', internal: true }, route);
    if (route.startsWith('lab/')) {
      const caller = await authenticate(req, { allowNoOwner: true });
      return await lab(req, caller, route);
    }
    const handler = routes[route];
    if (!handler) throw new HttpError(404, `Unknown route: ${route}`);
    const caller = await authenticate(req, { allowNoOwner: route === 'style/trends' });
    return await handler(req, caller, route);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, detail: e.detail }, e.status);
    console.error(route, e);
    return json({ error: 'Something went wrong', detail: String((e as Error)?.message ?? e).slice(0, 500) }, 500);
  }
});
