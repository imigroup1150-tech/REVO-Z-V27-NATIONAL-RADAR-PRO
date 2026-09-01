const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type,accept'}})}
export default async function handler(request){
  if(request.method==='OPTIONS') return json({ok:true});
  if(request.method!=='POST') return json({ok:false,error:'POST required'},405);
  let body; try{body=await request.json()}catch{return json({ok:false,error:'invalid JSON'},400)}
  const q=String(body?.q||'').trim(); const viewbox=String(body?.viewbox||'').trim();
  if(!q || q.length>120 || viewbox.length>160) return json({ok:false,error:'invalid parameters'},400);
  const url=`${NOMINATIM}?format=jsonv2&limit=40&bounded=1&viewbox=${encodeURIComponent(viewbox)}&q=${encodeURIComponent(q)}`;
  const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),6500);
  try{
    const r=await fetch(url,{headers:{'accept':'application/json','user-agent':'REVO-Z-National-Radar/23 (Netlify Function)'}});
    if(!r.ok) return json({ok:false,error:`Nominatim HTTP ${r.status}`},502);
    const data=await r.json(); return json(Array.isArray(data)?data:[]);
  }catch(e){return json({ok:false,error:String(e?.message||e)},502)}
  finally{clearTimeout(t)}
}
