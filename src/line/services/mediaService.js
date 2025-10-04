// server/src/line/services/mediaService.js

/**
 * mediaService.js  (stream version)
 * ---------------------------------
 * - ดึง media จาก LINE ทาง stream
 * - ตรวจสอบขนาดสูงสุดตามชนิดไฟล์
 * - pipe ลง uploads/temp/<type>/...
 */

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const mime   = require('mime-types');
const { pipeline } = require('stream/promises');
const { lineMessagingApiConfig } = require('../config/lineConfig');

/** 🔒 limit (byte) */
const MAX_FILE_SIZES = {
  image   : 1  * 1024 * 1024,   // 1 MB
  video   : 50 * 1024 * 1024,   // 50 MB
  file    : 20 * 1024 * 1024,   // 20 MB
  default : 10 * 1024 * 1024
};

// ดาวน์โหลด media จาก LINE และบันทึกลงในโฟลเดอร์ temp พร้อมตั้งชื่อไฟล์ให้ไม่ซ้ำ โดยใช้ ticketId + timestamp + รหัสสุ่ม
exports.downloadLineMedia = async (message, lineUid, ticketId, userId) => {
  const url     = `https://api-data.line.me/v2/bot/message/${message.id}/content`;
  const headers = { Authorization: `Bearer ${lineMessagingApiConfig.channelAccessToken}` };

  // (1) ตรวจสอบขนาดไฟล์และชนิด MIME โดยใช้ HEAD request
  const head = await axios.head(url, { headers });
  const size = Number(head.headers['content-length'] || 0);
  const cType = head.headers['content-type'] || 'application/octet-stream';

  // จำกัดขนาดไฟล์ตามประเภท (image / file / video)
  const limit = MAX_FILE_SIZES[message.type] ?? MAX_FILE_SIZES.default;
  if (size > limit) {
    throw new Error(
      `ไฟล์ของคุณมีขนาด ${(size / 1024 / 1024).toFixed(1)} MB เกิน ${(limit / 1024 / 1024)} MB`
    );
  }

  // (2) เตรียมโฟลเดอร์ปลายทางแบบ temp (เช่น /uploads/temp/image)
  const baseDir = path.join(__dirname, '../uploads/temp', message.type || 'others');
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

  // ตรวจสอบนามสกุลไฟล์จากชื่อหรือจาก MIME type
  const extHead = path.extname(message.fileName || '');
  const extMime = mime.extension(cType) || 'bin';
  const ext     = extHead && extHead.startsWith('.') ? extHead : `.${extMime}`;

  // (3.1) ตั้งชื่อหลักเดิม: ticket_<ticketId>_user_<userId>_<timestamp>.ext
  const safeTicketId = ticketId || 'unknown';
  const safeUserId   = userId || lineUid;
  const timestamp    = Date.now();
  const filename     = `ticket_${safeTicketId}_user_${safeUserId}_${timestamp}${ext}`;

  // (3.2) ชื่อสำรองแบบอ่านง่าย (ใช้ได้กรณีต้องการความไม่ซ้ำมากขึ้น)
  const now = new Date();
  const timeStr = now.toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '_'); // YYYYMMDD_HHmmss
  const random = Math.random().toString(36).substring(2, 5); // รหัสสุ่ม 3 ตัว
  const altFilename = `ticket_${safeTicketId}_${timeStr}_${random}${ext}`;

  // (3.3) ใช้ชื่อ altFilename แทน filename เพื่อหลีกเลี่ยงชื่อซ้ำ
  const absPath = path.join(baseDir, altFilename);

  // (4) ดาวน์โหลดข้อมูลจาก LINE แบบ stream แล้วเขียนลงไฟล์
  const res = await axios.get(url, { headers, responseType: 'stream' });
  await pipeline(res.data, fs.createWriteStream(absPath));  // non-blocking I/O

  // (5) คืนข้อมูล metadata ของไฟล์ (ไม่รวม buffer)
  return {
    originalname : message.fileName || altFilename,
    path         : `/uploads/temp/${message.type || 'others'}/${altFilename}`, // public path
    mimetype     : cType,
    size,
    extension    : ext
  };
};

exports.moveTempToPermanent = (meta, ticketId) => {
  const rootDir = path.join(__dirname, '..');

  // ✅ เพิ่มชนิด subfolder: image / video / file / others
  const type = {
    ภาพ: 'image',
    ไฟล์: 'file',
    วิดีโอ: 'video'
  }[meta.type] || 'others';

  const srcAbs = path.join(rootDir, meta.path);
  const destDir = path.join(rootDir, 'uploads', String(ticketId), type);

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const destAbs = path.join(destDir, path.basename(srcAbs));
  fs.renameSync(srcAbs, destAbs);

  return {
    ...meta,
    path: `/uploads/${ticketId}/${type}/${path.basename(destAbs)}` // ← path ใหม่
  };
};


// ลบไฟล์ temp จาก session ที่ยังไม่ถูกย้ายไปโฟลเดอร์ถาวร
// ใช้ในกรณีที่ผู้ใช้ "ยกเลิก" การแจ้งปัญหา แล้วไม่ต้องการเก็บไฟล์อีกต่อไป
exports.deleteTempFiles = (sess) => {
  const rootDir = path.join(__dirname, '..'); // หาตำแหน่ง root ของ uploads
  (sess?.data?.pending_files || []).forEach((m) => { // วนลูปไฟล์ที่อยู่ใน session
    try {
      fs.unlinkSync(path.join(rootDir, m.path)); // ลบไฟล์นั้นออกจาก disk
    } catch {} // ถ้าเกิด error (เช่น ไฟล์ไม่มี) ก็ปล่อยผ่าน
  });
};

// ลบโฟลเดอร์ทั้งหมดของ ticket รวมถึงไฟล์แนบทั้งหมดภายใน
// ใช้เมื่อลบ ticket แล้วต้องเคลียร์ไฟล์ที่อัปโหลดด้วย
exports.deleteTicketFolder = async (ticketId) => {
  const folderPath = path.join(__dirname, '../uploads', String(ticketId)); // path ไปยังโฟลเดอร์ของ ticket นั้น
  try {
    await fs.promises.rm(folderPath, { recursive: true, force: true }); // ลบโฟลเดอร์พร้อมเนื้อหาภายในแบบ force
    console.log(`🗑️ ลบโฟลเดอร์แนบ ticket-${ticketId} แล้ว`);
  } catch (err) {
    console.error(`❌ ลบโฟลเดอร์แนบไม่สำเร็จ ticket-${ticketId}:`, err.message);
  }
};


// ฟังก์ชันลบไฟล์เก่าจากโฟลเดอร์ temp ที่มีอายุมากกว่า maxAgeMinutes นาที
exports.cleanOldTempFiles = (maxAgeMinutes = 60) => { // ถ้าไม่มี การส่งค่าเข้ามา จะใช้ค่าเริ่มต้นเป็น 60
  const baseTempPath = path.join(__dirname, '../uploads/temp'); // โฟลเดอร์ temp หลัก
  const subfolders = ['image', 'video', 'file', 'others'];      // ประเภทย่อยของ media
  const now = Date.now();                                       // เวลาปัจจุบัน

  subfolders.forEach((sub) => {
    const folder = path.join(baseTempPath, sub); // โฟลเดอร์ย่อย เช่น /temp/image
    if (!fs.existsSync(folder)) return;          // ข้ามถ้าไม่มีโฟลเดอร์

    // อ่านชื่อไฟล์ทั้งหมดในโฟลเดอร์
    fs.readdir(folder, (err, files) => {
      if (err) return console.error(`❌ อ่าน ${folder} ไม่ได้:`, err.message);
      
      files.forEach((file) => {
        const fullPath = path.join(folder, file); // path เต็มของไฟล์

        // ตรวจสอบเวลาที่ไฟล์ถูกแก้ไขล่าสุด
        fs.stat(fullPath, (err, stats) => {
          if (err) return;
          const ageMs = now - stats.mtimeMs; // อายุของไฟล์ (ms)

          // ถ้าอายุมากกว่าเวลาที่กำหนด ให้ลบไฟล์
          if (ageMs > maxAgeMinutes * 60 * 1000) {
            fs.unlink(fullPath, (err) => {
              if (!err) console.log(`🧹 ลบไฟล์ temp เก่าแล้ว: ${fullPath}`);
            });
          }
        });
      });
    });
  });
};
