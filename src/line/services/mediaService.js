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

// ตัดสินชนิดสื่อให้แน่นอนตั้งแต่ต้น
function normalizeMediaType(messageType, mimeType = '', fileName = '') {
  const mt = (mimeType || '').toLowerCase();
  const fn = (fileName || '').toLowerCase();

  // 1) ตาม MIME ก่อนแม่นสุด
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('video/')) return 'video';
  if (mt.startsWith('audio/')) return 'file'; // จัดเป็นไฟล์ทั่วไปในระบบนี้

  // 2) ตาม message.type จาก LINE
  if (['image', 'video'].includes(messageType)) return messageType;
  if (['file', 'audio'].includes(messageType)) return 'file';

  // 3) ตามนามสกุลไฟล์
  if (/\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)$/.test(fn)) return 'image';
  if (/\.(mp4|mov|m4v|webm|avi|mkv)$/.test(fn)) return 'video';

  return 'file';
}

// แมปคำไทย/คำพ้องให้เป็น type มาตรฐาน
function sanitizeType(raw) {
  const t = String(raw || '').trim().toLowerCase();
  // ไทย → อังกฤษ
  if (['ภาพ', 'รูป', 'รูปภาพ'].includes(t)) return 'image';
  if (['วิดีโอ', 'วีดีโอ', 'วิดิโอ'].includes(t)) return 'video';
  if (['ไฟล์', 'เอกสาร'].includes(t)) return 'file';

  // อังกฤษตัวพ้อง
  if (t === 'images') return 'image';
  if (t === 'videos') return 'video';
  if (t === 'files')  return 'file';

  // ค่าที่ถูกต้องอยู่แล้ว
  if (['image','video','file','others'].includes(t)) return t;

  return t; // ปล่อยไปให้ validation ตัดสินต่อ (จะ throw ถ้าไม่อยู่ในเซ็ต)
}

// ดาวน์โหลด media จาก LINE และบันทึกลงในโฟลเดอร์ temp พร้อมตั้งชื่อไฟล์ให้ไม่ซ้ำ โดยใช้ ticketId + timestamp + รหัสสุ่ม
exports.downloadLineMedia = async (message, lineUid, ticketId, userId) => {
  const url     = `https://api-data.line.me/v2/bot/message/${message.id}/content`;
  const headers = { Authorization: `Bearer ${lineMessagingApiConfig.channelAccessToken}` };

  // (1) ตรวจสอบขนาดไฟล์และชนิด MIME โดยใช้ HEAD request
  const head = await axios.head(url, { headers });
  const size  = Number(head.headers['content-length'] || 0);
  const cType = head.headers['content-type'] || 'application/octet-stream';

  // ชนิดสื่อที่ normalize แล้ว (ใช้ต่อทั้งไฟล์)
  const mediaType = normalizeMediaType(message.type, cType, message.fileName);

  // จำกัดขนาดไฟล์ตามประเภท (image / file / video)
  const limit = MAX_FILE_SIZES[mediaType] ?? MAX_FILE_SIZES.default;
  if (size > limit) {
    throw new Error(
      `ไฟล์ของคุณมีขนาด ${(size / 1024 / 1024).toFixed(1)} MB เกิน ${(limit / 1024 / 1024)} MB`
    );
  }

  // (2) เตรียมโฟลเดอร์ปลายทางแบบ temp (เช่น uploads/temp/image)
  const baseDir = path.join(__dirname, '../uploads/temp', mediaType);
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

  // หา extension แบบมี fallback ตามชนิดสื่อ (กัน content-type เป็น octet-stream → .bin)
  const extFromName = path.extname(message.fileName || '').replace(/^\./, '');
  const extFromMime = mime.extension(cType) || '';
  let ext = extFromName || extFromMime;
  if (!ext || ext === 'bin') {
    if (mediaType === 'video') ext = 'mp4';
    else if (mediaType === 'image') ext = 'jpeg';
    else if (mediaType === 'audio' || mediaType === 'voice') ext = 'm4a';
    else ext = 'bin';
  }

  // (3) ตั้งชื่อไฟล์ temp
  const safeTicketId = ticketId || 'unknown';
  const safeUserId   = userId || lineUid; // (ยังไม่ได้ใช้ในชื่อ แต่อาจใช้ต่อภายหลัง)
  const now = new Date();
  const timeStr = now.toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '_'); // YYYYMMDD_HHmmss
  const random = Math.random().toString(36).substring(2, 5); // รหัสสุ่ม 3 ตัว
  const altFilename = `ticket_${safeTicketId}_${timeStr}_${random}.${ext}`;

  // (4) path เต็มไฟล์ temp + ดาวน์โหลดแบบ stream
  const absPath = path.join(baseDir, altFilename);
  const res = await axios.get(url, { headers, responseType: 'stream' });
  await pipeline(res.data, fs.createWriteStream(absPath));  // non-blocking I/O

  // (5) คืนข้อมูล metadata (ใส่ type ชัดเจน + path แบบ relative)
  return {
    originalname : message.fileName || altFilename,
    path         : `uploads/temp/${mediaType}/${altFilename}`, // เก็บเป็น relative (ไม่มี / นำหน้า)
    mimetype     : cType,
    size,
    extension    : `.${ext}`,
    type         : mediaType,
  };
};

// ใช้ meta.type เท่านั้น (แต่รองรับคำไทยด้วย)
exports.moveTempToPermanent = (meta, ticketId) => {
  const rootDir = path.join(__dirname, '..');

  // 1) sanitize type ก่อน validate
  const allowed = new Set(['image', 'video', 'file', 'others']);
  const type = sanitizeType(meta?.type);
  if (!allowed.has(type)) {
    // ให้ fail ชัด ๆ เพื่อหา root cause ที่จุดกำเนิด meta
    throw new Error(`Invalid meta.type: ${meta?.type}. Expected one of ${[...allowed].join(', ')}`);
  }

  // 2) ทำ path ให้เป็น relative เสมอ (กัน / หรือ \ นำหน้า)
  const relPath = String(meta.path || '').replace(/^[/\\]+/, '');
  const srcAbs  = path.join(rootDir, relPath);

  // 3) สร้างปลายทางตาม ticketId/type แล้วย้ายไฟล์
  const destDir = path.join(rootDir, 'uploads', String(ticketId), type);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const destAbs = path.join(destDir, path.basename(srcAbs));
  fs.renameSync(srcAbs, destAbs);

  // 4) คืน meta เดิม โดยอัปเดต path ใหม่ (คง type ตามเดิมที่ sanitize แล้ว)
  return {
    ...meta,
    type,
    path: `/uploads/${ticketId}/${type}/${path.basename(destAbs)}`
  };
};


// ลบไฟล์ temp จาก session ที่ยังไม่ถูกย้ายไปโฟลเดอร์ถาวร
// ใช้ในกรณีที่ผู้ใช้ "ยกเลิก" การแจ้งปัญหา แล้วไม่ต้องการเก็บไฟล์อีกต่อไป
exports.deleteTempFiles = (sess) => {
  const rootDir = path.join(__dirname, '..'); // หาตำแหน่ง root ของ uploads
  (sess?.data?.pending_files || []).forEach((m) => {
    try {
      const rel = String(m.path || '').replace(/^[/\\]+/, '');
      fs.unlinkSync(path.join(rootDir, rel));
    } catch {}
  });
};

// ลบโฟลเดอร์ทั้งหมดของ ticket รวมถึงไฟล์แนบทั้งหมดภายใน
// ใช้เมื่อลบ ticket แล้วต้องเคลียร์ไฟล์ที่อัปโหลดด้วย
exports.deleteTicketFolder = async (ticketId) => {
  const folderPath = path.join(__dirname, '../uploads', String(ticketId));
  try {
    await fs.promises.rm(folderPath, { recursive: true, force: true });
    console.log(`🗑️ ลบโฟลเดอร์แนบ ticket-${ticketId} แล้ว`);
  } catch (err) {
    console.error(`❌ ลบโฟลเดอร์แนบไม่สำเร็จ ticket-${ticketId}:`, err.message);
  }
};


// ฟังก์ชันลบไฟล์เก่าจากโฟลเดอร์ temp ที่มีอายุมากกว่า maxAgeMinutes นาที
exports.cleanOldTempFiles = (maxAgeMinutes = 60) => {
  const baseTempPath = path.join(__dirname, '../uploads/temp');
  const subfolders = ['image', 'video', 'file', 'others'];
  const now = Date.now();

  subfolders.forEach((sub) => {
    const folder = path.join(baseTempPath, sub);
    if (!fs.existsSync(folder)) return;

    // อ่านชื่อไฟล์ทั้งหมดในโฟลเดอร์
    fs.readdir(folder, (err, files) => {
      if (err) return console.error(`❌ อ่าน ${folder} ไม่ได้:`, err.message);

      files.forEach((file) => {
        const fullPath = path.join(folder, file);
        fs.stat(fullPath, (err, stats) => {
          if (err) return;
          const ageMs = now - stats.mtimeMs;
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
