import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('shows the ROG Phone 9 model guide immediately after MuMu setup', () => {
  const mumu = html.indexOf('📲 2. ตั้งค่า MuMu');
  const model = html.indexOf('📱 3. วิธีตั้งค่าโมเดลโทรศัพท์ใน MuMu Player (ROG Phone 9)');
  const nextGuide = html.indexOf('💡 คำแนะนำการใช้งานบอทเพิ่มเติม');

  assert.ok(mumu >= 0);
  assert.ok(model > mumu);
  assert.ok(nextGuide > model);
});

test('includes the warning, exact model values, and restart checklist', () => {
  assert.match(html, /⚠️ สำคัญ หากใช้บอทสมัครไอดีแล้วบอททำงานผิดพลาด/);
  assert.match(html, /ยี่ห้อโทรศัพท์:[\s\S]*Asus/);
  assert.match(html, /รุ่นโทรศัพท์:[\s\S]*ROG Phone 9/);
  assert.match(html, /รุ่นตัวเครื่อง:[\s\S]*ASUSAI2501B/);
  assert.match(html, /ปิด MuMu Player/);
  assert.match(html, /เปิดใหม่อีกครั้ง/);
  assert.match(html, /ตรวจสอบว่าเครื่องแสดงเป็น[\s\S]*ROG Phone 9/);
});
