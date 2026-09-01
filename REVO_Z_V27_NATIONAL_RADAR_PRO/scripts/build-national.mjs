import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve('data/radar-national');
const MANIFEST = path.join(DATA_DIR, 'manifest.json');
const LEGACY = path.resolve('data/radar-national.json');
const BUILD_MARK = path.resolve('data/radar-national.build.json');

// 12 Thailand-only bounding boxes. Small enough to avoid the timeouts that
// caused the previous all-in-one national build to silently produce 0 points.
const LAT_EDGES=[5.4,9.5,13.5,17.5,21.0];
const LNG_EDGES=[97.0,100.0,103.0,106.0];
const BOUNDS=[];
for(let y=0;y<LAT_EDGES.length-1;y++) for(let x=0;x<LNG_EDGES.length-1;x++)
  BOUNDS.push([LAT_EDGES[y],LNG_EDGES[x],LAT_EDGES[y+1],LNG_EDGES[x+1]]);

const HOSTS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
  'https://overpass.monicz.dev/api/interpreter'
];

const GROUPS={
  control:{
    cats:['speedcamera','redlight','checkpoint','police','school','bridge'],
    clauses:[
      `nwr["highway"="speed_camera"]`,
      `nwr["man_made"="speed_camera"]`,
      `nwr["camera:type"~"speed|radar",i]`,
      `nwr["enforcement"~"maxspeed|average_speed|speed",i]`,
      `nwr["traffic_signals:camera"]`,
      `nwr["enforcement"~"red_light|traffic_signals",i]`,
      `nwr["highway"="traffic_signals"]`,
      `nwr["checkpoint"]`,
      `nwr["checkpoint:type"]`,
      `nwr["barrier"="checkpoint"]`,
      `nwr["highway"="checkpoint"]`,
      `nwr["police"]`,
      `nwr["amenity"="police"]`,
      `nwr["office"="police"]`,
      `nwr["building"="police"]`,
      `nwr["police"="checkpoint"]`,
      `nwr["police"="offices"]`,
      `nwr["police"="booth"]`,
      `nwr["amenity"="school"]`,
      `nwr["amenity"="kindergarten"]`,
      `nwr["building"~"school|kindergarten",i]`,
      `way["bridge"]`,
      `nwr["man_made"="bridge"]`,
      `nwr["amenity"="weighbridge"]`,
      `nwr["man_made"="weighbridge"]`,
      `nwr["barrier"="toll_booth"]`,
      `nwr["highway"="toll_gantry"]`,
      `nwr["amenity"="customs"]`,
      `nwr["barrier"="border_control"]`
    ]
  },
  hazards:{
    cats:['accident','traffic','roadclosed','danger','construction','subsidence','detour','flood','restricted','narrow','slippery','steep','dangerous_curve'],
    clauses:[
      `nwr["hazard"]`,
      `nwr["accident"]`,
      `nwr["black_spot"]`,
      `nwr["accident_black_spot"]`,
      `nwr["congestion"]`,
      `nwr["bottleneck"]`,
      `way["highway"]["lanes"="1"]`,
      `way["highway"]["narrow"="yes"]`,
      `nwr["barrier"="road_closure"]`,
      `way["highway"]["access"="no"]`,
      `way["highway"]["motor_vehicle"="no"]`,
      `nwr["impassable"="yes"]`,
      `nwr["highway"="construction"]`,
      `nwr["construction:highway"]`,
      `nwr["landuse"="construction"]`,
      `nwr["building"="construction"]`,
      `nwr["natural"="sinkhole"]`,
      `nwr["hazard"~"subsid|sinkhole|landslide|rockfall|collapse|erosion",i]`,
      `way["highway"]["smoothness"~"very_bad|horrible|very_horrible|impassable",i]`,
      `nwr["route"="detour"]`,
      `nwr["detour"]`,
      `nwr["traffic_sign"~"detour|diversion",i]`,
      `nwr["hazard"~"flood|flooding",i]`,
      `nwr["flood_prone"="yes"]`,
      `way["access"~"no|private",i]`,
      `way["motor_vehicle"="no"]`,
      `way["vehicle"="no"]`,
      `nwr["access:conditional"]`,
      `nwr["hazard"="slippery"]`,
      `way["highway"]["surface"~"cobblestone|gravel|ground|mud",i]`,
      `nwr["hazard"~"steep_incline|steep_slope",i]`,
      `way["highway"]["incline"]`,
      `nwr["hazard"~"curve|dangerous_curve",i]`,
      `nwr["curve"~"dangerous|sharp",i]`
    ]
  }
};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const bboxSuffix=b=>`(${b[0]},${b[1]},${b[2]},${b[3]})`;
function makeQuery(group,b){
  const body=group.clauses.map(c=>`${c}${bboxSuffix(b)};`).join('');
  return `[out:json][timeout:110];(${body});out body center qt;`;
}
function infer(el){
  const t=el.tags||{}; const low=JSON.stringify(t).toLowerCase();
  let cat=null;
  const speed= /speed_camera|camera:type.*(?:speed|radar)|enforcement.*(?:maxspeed|average_speed|speed)/i.test(low);
  if(speed) cat='speedcamera';
  else if(/traffic_signals:camera|enforcement.*(?:red_light|traffic_signals)/i.test(low) || t.highway==='traffic_signals') cat='redlight';
  else if(t.police==='checkpoint'||/checkpoint|toll_booth|toll_gantry|weighbridge|border_control|customs/i.test(low)) cat='checkpoint';
  else if(t.amenity==='police'||t.office==='police'||t.building==='police'||/^booth|offices$/.test(String(t.police||''))) cat='police';
  else if(t.amenity==='school'||t.amenity==='kindergarten'||/school|kindergarten/i.test(String(t.building||''))) cat='school';
  else if(t.bridge==='yes'||t.man_made==='bridge') cat='bridge';
  else if(t.highway==='construction'||t['construction:highway']||t.landuse==='construction'||t.building==='construction') cat='construction';
  else if(t.barrier==='road_closure'||t.impassable==='yes'||t.access==='no'||t.motor_vehicle==='no'||t.vehicle==='no') cat='roadclosed';
  else if(/accident|black_spot/.test(low)) cat='accident';
  else if(t.hazard==='flood'||t.flood_prone==='yes') cat='flood';
  else if(/subsid|sinkhole|landslide|rockfall|collapse|erosion/i.test(String(t.hazard||'')) || /very_bad|horrible|very_horrible|impassable/i.test(String(t.smoothness||''))) cat='subsidence';
  else if(t.route==='detour'||t.detour||/detour|diversion/i.test(String(t['traffic_sign']||''))) cat='detour';
  else if(t.hazard==='slippery'||/cobblestone|gravel|ground|mud/i.test(String(t.surface||''))) cat='slippery';
  else if(t.hazard==='steep_incline'||t.hazard==='steep_slope'||t.incline) cat='steep';
  else if(t.hazard==='curve'||t.hazard==='dangerous_curve'||/dangerous|sharp/i.test(String(t.curve||''))) cat='dangerous_curve';
  else if(t.congestion||t.bottleneck) cat='traffic';
  else if(t.narrow==='yes'||String(t.lanes)==='1') cat='narrow';
  else if(t.hazard) cat='danger';
  else if(t.access==='private'||t['access:conditional']) cat='restricted';
  if(!cat)return null;
  let lat=el.lat, lng=el.lon; if(lat==null&&el.center){lat=el.center.lat;lng=el.center.lon;} if(lat==null||lng==null)return null;
  const name=t.name_th||t['name:th']||t.name||t.ref||'';
  return {lat:Number(lat),lng:Number(lng),cat,name,source:'national-osm',osmType:el.type,osmId:el.id,
    limit:Number(t.maxspeed)||Number(t['maxspeed:forward'])||null,operator:t.operator||t.brand||'',ref:t.ref||'',
    confidence:cat==='speedcamera'?(t.highway==='speed_camera'||t.man_made==='speed_camera'?'high':'medium'):'standard'};
}
async function fetchOverpass(url,query){
  const c=new AbortController(); const tm=setTimeout(()=>c.abort(),115000);
  try{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:`data=${encodeURIComponent(query)}`,signal:c.signal});
    if(!r.ok) throw new Error(`HTTP ${r.status}`); const j=await r.json(); if(!Array.isArray(j.elements)) throw new Error('invalid Overpass response'); return j;
  }finally{clearTimeout(tm)}
}
async function fetchTask(group,b,idx){
  let last='';
  const rot=[...HOSTS.slice(idx%HOSTS.length),...HOSTS.slice(0,idx%HOSTS.length)];
  for(let pass=0;pass<2;pass++) for(const h of rot){
    try{return await fetchOverpass(h,makeQuery(group,b));}
    catch(e){last=String(e?.message||e); await sleep(400);}
  }
  throw new Error(last||'all mirrors failed');
}

async function main(){
  await fs.mkdir(DATA_DIR,{recursive:true});
  const tempDir=path.join(DATA_DIR,'.tmp'); await fs.rm(tempDir,{recursive:true,force:true}); await fs.mkdir(tempDir,{recursive:true});
  const all=new Map(); let completed=0, failures=0;
  const tasks=[]; let ti=0;
  for(let bi=0;bi<BOUNDS.length;bi++) for(const [gname,g] of Object.entries(GROUPS)) tasks.push({bi,gname,g,b:BOUNDS[bi],idx:ti++});

  const workers=Array.from({length:3},async(_,worker)=>{
    while(true){const task=tasks.shift(); if(!task)return; try{
      const data=await fetchTask(task.g,task.b,task.idx);
      for(const el of data.elements){const p=infer(el);if(!p)continue; const k=`${p.osmType}/${p.osmId}/${p.cat}`;all.set(k,p);}
      completed++; console.log(`national ${completed}/${tasks.length+completed}: zone ${task.bi+1}/${BOUNDS.length} ${task.gname}, total ${all.size}`);
    }catch(e){failures++;console.warn(`FAILED zone ${task.bi+1} ${task.gname}:`,e.message);}
    }
  });
  await Promise.all(workers);

  if(all.size<1000 || failures>Math.floor(tasks.length*0.5)){
    throw new Error(`National build refused: only ${all.size} usable points, ${failures} task failures. No empty/incomplete national dataset will be published.`);
  }
  const points=[...all.values()];
  const tileSize=1;
  const tiles=new Map(); const counts={};
  for(const p of points){
    const tx=Math.floor(p.lng/tileSize),ty=Math.floor(p.lat/tileSize),k=`${ty}:${tx}`;
    if(!tiles.has(k))tiles.set(k,[]);tiles.get(k).push(p);counts[p.cat]=(counts[p.cat]||0)+1;
  }
  await fs.rm(tempDir,{recursive:true,force:true}); await fs.mkdir(tempDir,{recursive:true});
  const manifestTiles=[];
  for(const [k,pts] of tiles){const [ty,tx]=k.split(':').map(Number);const file=`${ty}_${tx}.json`;await fs.writeFile(path.join(tempDir,file),JSON.stringify({schema:'REVO-Z-NATIONAL-RADAR-V27-TILE',tile:k,tileSize,points:pts}));manifestTiles.push({key:k,file,count:pts.length});}
  manifestTiles.sort((a,b)=>a.key.localeCompare(b.key));
  const manifest={schema:'REVO-Z-NATIONAL-RADAR-V27',country:'TH',generatedAt:new Date().toISOString(),totalPoints:points.length,counts,tileSize,tiles:manifestTiles,coverageNote:'OpenStreetMap-mapped objects only; not a census. Temporary events such as live congestion/accidents are supplied by live/community sources.'};
  await fs.writeFile(path.join(tempDir,'manifest.json'),JSON.stringify(manifest));
  const legacy={schema:'REVO-Z-NATIONAL-RADAR-V27',country:'TH',generatedAt:manifest.generatedAt,totalPoints:points.length,counts,tileSize,tiles:manifestTiles.length,points:[],coverageNote:'The full national dataset is split into spatial tiles under data/radar-national/. Client loads only tiles around the current GPS position.'};
  await fs.writeFile(BUILD_MARK,JSON.stringify({schema:'REVO-Z-NATIONAL-RADAR-V27',generatedAt:manifest.generatedAt,totalPoints:points.length,failures}));
  await fs.rm(DATA_DIR,{recursive:true,force:true}); await fs.mkdir(DATA_DIR,{recursive:true});
  for(const f of await fs.readdir(tempDir)) await fs.rename(path.join(tempDir,f),path.join(DATA_DIR,f));
  await fs.writeFile(LEGACY,JSON.stringify(legacy));
  await fs.rm(tempDir,{recursive:true,force:true});
  console.log(`National build OK: ${points.length} points across ${manifestTiles.length} tiles`);
}
main().catch(e=>{console.error(e);process.exit(1)});
