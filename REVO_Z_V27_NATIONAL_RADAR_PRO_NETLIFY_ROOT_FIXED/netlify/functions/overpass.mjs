const ALLOWED_HOSTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

const MAX_BODY = 900_000;
const QUERY_LIMIT = 1_100_000;

function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,accept',
      ...headers
    }
  });
}

function pickSafeQuery(q) {
  const query = String(q || '').trim();
  if (!query || query.length > QUERY_LIMIT) return null;
  // The browser is expected to send Overpass QL. This gate blocks accidental
  // non-Overpass payloads and arbitrary URLs/scripts.
  if (!/^\[out:json\]/i.test(query)) return null;
  if (/https?:\/\//i.test(query)) return null;
  if (!/\bout\s+(body|center|ids|meta|skel|tags)/i.test(query)) return null;
  return query;
}

async function fetchOne(url, query, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'accept': 'application/json'
    },
    body: `data=${encodeURIComponent(query)}`,
    signal
  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.elements)) throw new Error('Overpass response invalid');
  return {data, via:url};
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return json({ok:true});
  if (request.method !== 'POST') return json({ok:false,error:'POST required'},405);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ok:false,error:'request too large'},413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ok:false,error:'invalid JSON'},400); }
  const query = pickSafeQuery(body?.query);
  if (!query) return json({ok:false,error:'invalid Overpass query'},400);

  const ctl = new AbortController();
  const timer = setTimeout(()=>ctl.abort(), 12000);
  try {
    const errors=[];
    // Try a short, trusted pool. The client already does additional mirrors if
    // this proxy is unavailable. Keeping this list small protects the serverless
    // function from fan-out storms.
    for (const host of ALLOWED_HOSTS) {
      try {
        const hit = await fetchOne(host, query, ctl.signal);
        return json({ ...hit.data, __revoVia: hit.via });
      } catch (e) {
        errors.push(String(e?.message || e));
      }
    }
    return json({ok:false,error:errors.join(' | ') || 'all Overpass sources failed'},502);
  } finally {
    clearTimeout(timer);
  }
}
