// server/src/line/utils/validators.js

// ตรวจสอบข้อความว่ามีลักษณะเป็นสแปมหรือไม่
exports.isSpammyText = (text) => {
  if (!text) return true;                     // ถ้าไม่มีข้อความเลย
  if (text.length > 1000) return true;        // ถ้ายาวเกิน 1000 ตัวอักษร
  if (/(.)\1{10,}/.test(text)) return true;   // ถ้ามีตัวอักษรเดียวกันซ้ำเกิน 10 ตัวติดกัน
  if (/^[^ก-๙a-zA-Z0-9\s]+$/.test(text)) return true; // ไม่มีอักษรจริงเลย เช่น สัญลักษณ์อย่างเดียว
  if (text.replace(/\s/g, '').length < 5) return true; // ตัดเว้นวรรคแล้วเหลือตัวอักษรน้อยเกิน
  return false;                               // ถ้าไม่เข้าเงื่อนไขข้างบน ถือว่าไม่ใช่สแปม
};

// ตรวจสอบว่าเบอร์โทรศัพท์ไม่ถูกต้องตามรูปแบบที่กำหนดหรือไม่
exports.isInvalidPhone = (phone) => {
  if (!/^0[689]\d{8}$/.test(phone)) return true;   // ต้องขึ้นต้นด้วย 06, 08, หรือ 09 และตามด้วยอีก 8 ตัวเลข
  if (/^(\d)\1+$/.test(phone)) return true;        // ห้ามเป็นเลขเดียวกันทั้งหมด เช่น 0000000000
  return false;                                     // ถ้าผ่านเงื่อนไข ถือว่าเป็นเบอร์ที่ถูกต้อง
};

// ตรวจสอบว่าเป็นชื่อที่ไม่สมเหตุสมผลหรือไม่
exports.isInvalidName = (name) => {
  if (!name) return true;                        // ชื่อว่าง
  if (name.length < 2 || name.length > 100) return true;  // สั้นเกินไปหรือยาวเกินไป
  if (/[^ก-๙a-zA-Z\s.]/.test(name)) return true; // มีอักขระแปลก ๆ (เช่น emoji, ตัวเลข)
  if (/^(\S)\1{2,}$/.test(name)) return true;    // ตัวอักษรเดียวซ้ำติดกันเกิน 2 ตัว (เช่น "aaaaaa")
  return false;
};
