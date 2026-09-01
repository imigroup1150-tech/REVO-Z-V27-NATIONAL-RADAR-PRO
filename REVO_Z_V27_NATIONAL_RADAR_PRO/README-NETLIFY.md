# REVO Z V27 — National Radar Pro

## จุดที่แก้จาก V26
- National dataset ไม่ใช่ JSON เปล่าอีกต่อไป: build จะสร้างฐานประเทศไทยจริงเป็น spatial tiles 1° x 1°
- หน้าเรดาร์ใช้ลำดับ GPS → local cached national tiles → แสดงทันที → live OSM top-up
- เปลี่ยนหมวด/รัศมีจะกรองข้อมูลที่โหลดแล้วในเครื่องทันที โดยไม่ต้องรอ network
- เมื่อรถเคลื่อน ระบบโหลด tile ที่ยังไม่เคยโหลดและค้นสดเติมจุดใหม่ภายหลัง
- ข้อมูลผู้ใช้แก้ไข/เพิ่ม/รายงานผิดถูกเก็บใน IndexedDB + localStorage และส่งเข้าฐานกลางผ่าน Netlify Blobs แบบ strong consistency
- ตัดข้อมูลปลอมจากการเดาพิกัด: ทุก national point ต้องมีพิกัด OSM จริงและ osmType/osmId
- การสร้างฐานประเทศล้มเหลวหรือได้ข้อมูลน้อยผิดปกติจะทำให้ **Netlify build fail** แทนการ deploy เว็บที่ฐานว่าง
- ขยายตำรวจให้รองรับ amenity=police, office=police, building=police, police=checkpoint, police=offices, police=booth
- สัญญาณไฟใช้ highway=traffic_signals และ traffic_signals:camera/enforcement hints
- เพิ่มการคัดกรอง access/private/motor_vehicle/vehicle/access:conditional อย่างระมัดระวัง ไม่ถือ permissive เป็นทางห้ามผ่าน
- ระบบทริปจบเมื่อหยุดนิ่งต่อเนื่อง 5 นาที (300 วินาที)

## หมวดเรดาร์
🚨 อุบัติเหตุ
🚗 รถติด/คอขวด
✋ ด่านตรวจ
📷 กล้องจับความเร็ว
🚦 ไฟแดง/กล้องฝ่าไฟแดง
🚧 ทางปิด
⚠️ จุดอันตราย
🚜 ก่อสร้าง/ซ่อมถนน
⛔ ทางทรุด/ชำรุด
↪️ ทางเลี่ยง
🌊 น้ำท่วม
🚫 พื้นที่ห้ามผ่าน
🏫 โรงเรียน
↔️ ทางแคบ/เลนเดียว
🌉 สะพาน
🛞 ถนนลื่น
⛰️ ทางขึ้นเขา/ลงเขา
↪️ ทางโค้งอันตราย
🚓 สถานีตำรวจ/ป้อม/จุดตำรวจที่ถูกทำแผนที่

## วิธี deploy ที่ถูกต้อง
ใช้ Continuous Deployment จาก Git หรือ Netlify CLI เพื่อให้ Netlify รัน:
`node scripts/build-national.mjs`

ไม่ควรใช้ manual/static drag-and-drop หากต้องการ National Database เพราะการวางไฟล์เฉย ๆ จะไม่รัน build command และไฟล์ placeholder ที่ตั้งไว้จะทำให้หน้าเว็บแจ้งว่า National dataset ยังไม่พร้อม ซึ่งเป็นพฤติกรรมที่ตั้งใจไว้เพื่อกันการ deploy ฐานว่าง

## National dataset
ข้อมูลมาจาก OpenStreetMap Thailand extract ผ่าน Overpass ในขั้น Build และถูกแบ่งเป็น tile files เพื่อไม่ต้องดาวน์โหลดฐานประเทศไทยทั้งหมดเข้าโทรศัพท์ครั้งเดียว

ตัวระบบไม่อ้างว่า OSM ครอบคลุมทุกสถานที่จริงในประเทศไทย 100% เพราะแผนที่ชุมชนอาจมีข้อมูลตกหล่น โดยเฉพาะเหตุการณ์ชั่วคราว เช่น รถติด/อุบัติเหตุ/น้ำท่วม ระบบจึงมี live discovery + user correction เป็นชั้นเสริม

## Google Maps
ปุ่ม Google Maps ใช้ URL แบบ coordinate-first (`lat,lng`) เพื่อไม่ให้ชื่อสถานที่ที่คลุมเครือทำให้ Google ค้นไปอีกตำแหน่งหนึ่ง ระบบยังแสดง source/OSM id สำหรับตรวจสอบจุดต้นทาง

## Safety
ระบบไม่อนุญาตให้บันทึกจุดที่ไม่มีพิกัดในขอบเขตประเทศไทย และไม่ถือ network failure เป็นหลักฐานว่า “ไม่มีสถานที่”
