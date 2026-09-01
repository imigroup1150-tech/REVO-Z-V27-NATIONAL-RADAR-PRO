export default async function handler() {
  return new Response(JSON.stringify({
    ok: true,
    service: 'revo-z-radar',
    now: new Date().toISOString(),
    region: 'TH',
    version: 'V23'
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
