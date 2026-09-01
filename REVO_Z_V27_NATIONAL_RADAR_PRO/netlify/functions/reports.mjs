import { getStore } from '@netlify/blobs';
const STORE='revo-z-radar-community-v24';
const HAZ='hazard_report:';
const RET='radar_retract:';
const EDIT='radar_edit:';
const MAX=20000;
const TH={lat:[5,21],lng:[97,106]};
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,accept'}});
const safeKey=(k)=>typeof k==='string'&&k.length<180&&/^[a-zA-Z0-9:_./@,-]+$/.test(k);
const validPoint=p=>p&&Number.isFinite(Number(p.lat))&&Number(p.lat)>=TH.lat[0]&&Number(p.lat)<=TH.lat[1]&&Number.isFinite(Number(p.lng))&&Number(p.lng)>=TH.lng[0]&&Number(p.lng)<=TH.lng[1]&&p.cat;
export default async function handler(req){
 if(req.method==='OPTIONS')return json({ok:true});
 const store=getStore({name:STORE,consistency:'strong'});
 try{
  if(req.method==='GET'){
   const u=new URL(req.url),key=u.searchParams.get('key'),mode=u.searchParams.get('mode');
   if(mode==='retractions'){const a=await store.list({prefix:RET});return json({ok:true,keys:(a?.blobs||[]).map(x=>x.key).slice(0,5000)});}
   if(mode==='edits'){const a=await store.list({prefix:EDIT});return json({ok:true,keys:(a?.blobs||[]).map(x=>x.key).slice(0,5000)});}
   if(key){if(!safeKey(key))return json({ok:false,error:'invalid key'},400);const v=await store.get(key);return v==null?json({ok:false,error:'not found'},404):json({ok:true,value:v});}
   const prefix=u.searchParams.get('prefix'); if(prefix){const p=[HAZ,RET,EDIT].some(x=>prefix.startsWith(x))?prefix:HAZ;const a=await store.list({prefix:p});return json({ok:true,keys:(a?.blobs||[]).map(x=>x.key).slice(0,5000)});}
   return json({ok:false,error:'missing mode/key/prefix'},400);
  }
  if(req.method==='POST'){
   const b=await req.json();
   if(b?.op==='retract'){
    if(!b.pointKey||!safeKey(b.pointKey)||!validPoint(b.point))return json({ok:false,error:'invalid retract'},400);
    const id=String(b.reporterId||crypto.randomUUID());
    const k=RET+encodeURIComponent(b.pointKey)+'|'+id.replace(/[^a-zA-Z0-9-]/g,'').slice(0,40);
    await store.set(k,JSON.stringify({pointKey:b.pointKey,point:b.point,reason:String(b.reason||'ข้อมูลไม่ถูกต้อง').slice(0,300),reportedAt:Date.now()}));
    return json({ok:true,key:k});
   }
   if(b?.op==='upsert'){
    if(!validPoint(b.point))return json({ok:false,error:'invalid point'},400);
    const k=EDIT+encodeURIComponent(String(b.point.osmType!=null?`${b.point.osmType}/${b.point.osmId}`:`${b.point.cat}@${Number(b.point.lat).toFixed(6)},${Number(b.point.lng).toFixed(6)}`));
    await store.set(k,JSON.stringify({point:b.point,updatedAt:Date.now()}));
    return json({ok:true,key:k});
   }
   if(b?.key&&b?.value){if(!safeKey(b.key)||String(b.value).length>MAX)return json({ok:false,error:'invalid'},400);await store.set(b.key,String(b.value));return json({ok:true,key:b.key});}
   return json({ok:false,error:'invalid operation'},400);
  }
  if(req.method==='DELETE'){
   const u=new URL(req.url),key=u.searchParams.get('key');if(!safeKey(key))return json({ok:false,error:'invalid key'},400);await store.delete(key);return json({ok:true});
  }
  return json({ok:false,error:'method not allowed'},405);
 }catch(e){return json({ok:false,error:String(e?.message||e)},500)}
}
