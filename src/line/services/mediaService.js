// server/src/line/services/mediaService.js
/**
 * mediaService.js (robust stream version)
 * - ดาวน์โหลดจาก LINE -> เขียน .part -> rename เป็นไฟล์จริงใน temp (atomic)
 * - ย้าย temp -> uploads/<ticketId>/<type> โดย ensureDir + กัน EXDEV + กันรีไทร
 * - เก็บ path แบบ "relative" (ไม่มี / นำหน้า) เพื่อประกอบเป็น URL ภายหลัง
 */

const axios = require('axios');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const mime = require('mime-types');
const { pipeline } = require('stream/promises');
const { lineMessagingApiConfig } = require('../config/lineConfig');

/** ---- Path base ให้ "นิ่ง" และชัดเจน ---- */
const ROOT_DIR = path.resolve(__dirname, '..');                // .../src/line
const UPLOAD_ROOT = path.join(ROOT_DIR, 'uploads');            // .../src/line/uploads
const TEMP_ROOT = path.join(UPLOAD_ROOT, 'temp');              // .../src/line/uploads/temp

/** ---- Limit ขนาดไฟล์ (byte) ---- */
const MAX_FILE_SIZES = {
  image: 1 * 1024 * 1024,   // 1 MB
  video: 50 * 1024 * 1024,  // 50 MB
  file: 20 * 1024 * 1024,   // 20 MB
  default: 10 * 1024 * 1024
};

/** ---- utils ---- */
const typeDir = (t) => ({ image: 'image', video: 'video', file: 'file' }[t] || 'file');
async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); return dir; }
async function safeStat(p) { try { return await fsp.stat(p); } catch { return null; } }
function relPath(...segs) {
  // คืนค่า path รูปแบบ relative (ไม่มี / ข้างหน้า)
  const p = path.join(...segs).split(path.sep).join('/');
  return p.replace(/^\/+/, '');
}
async function moveFileAcrossFS(src, dest) {
  try {
    await fsp.rename(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      // ต่าง filesystem → copy + unlink
      await pipeline(fs.createReadStream(src), fs.createWriteStream(dest));
      await fsp.unlink(src);
    } else {
      throw err;
    }
  }
}

/** ✅ ดาวน์โหลดสู่ temp (atomic) */
exports.downloadLineMedia = async (message, lineUid, ticketId, userId) => {
  const url = `https://api-data.line.me/v2/bot/message/${message.id}/content`;
  const headers = { Authorization: `Bearer ${lineMessagingApiConfig.channelAccessToken}` };

  // 1) ตรวจสอบขนาด + MIME โดย HEAD
  const head = await axios.head(url, { headers, timeout: 15000 });
  const size = Number(head.headers['content-length'] || 0);
  const cType = head.headers['content-type'] || 'application/octet-stream';

  // จำกัดขนาดตามประเภท
  const declaredType = (message.type || '').toLowerCase();
  const limit = MAX_FILE_SIZES[declaredType] ?? MAX_FILE_SIZES.default;
  if (size > limit) {
    throw new Error(
      `ไฟล์ของคุณมีขนาด ${(size / 1024 / 1024).toFixed(1)} MB เกิน ${(limit / 1024 / 1024)} MB`
    );
  }

  // 2) เตรียมโฟลเดอร์ temp/<type>
  const tempTypeDir = await ensureDir(path.join(TEMP_ROOT, typeDir(declaredType)));

  // 3) ตั้งชื่อไฟล์ไม่ซ้ำ
  const extHead = path.extname(message.fileName || '');
  const extMime = mime.extension(cType) || 'bin';
  const ext = extHead && extHead.startsWith('.') ? extHead : `.${extMime}`;

  const safeTicketId = ticketId || 'unknown';
  const safeUserId = userId || lineUid || 'unknown';
  const iso = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15); // YYYYMMDD_HHmmss
  const rand = Math.random().toString(36).slice(2, 5);
  const fileBase = `ticket_${safeTicketId}_user_${safeUserId}_${iso}_${rand}`;
  const fileName = `${fileBase}${ext}`;

  const absPart = path.join(tempTypeDir, `${fileName}.part`);
  const absFinal = path.join(tempTypeDir, fileName);

  // 4) ดาวน์โหลด stream -> .part -> rename เป็นไฟล์จริง (atomic)
  const res = await axios.get(url, { headers, responseType: 'stream', timeout: 30000 });
  await pipeline(res.data, fs.createWriteStream(absPart));
  await fsp.rename(absPart, absFinal);

  // 5) คืน meta (เก็บ path แบบ relative สำหรับบันทึก DB/ส่ง client)
  return {
    type: typeDir(declaredType),                                      // 'image' | 'video' | 'file'
    originalname: message.fileName || fileName,
    path: relPath('uploads', 'temp', typeDir(declaredType), fileName),// uploads/temp/<type>/<file>
    mimetype: cType,
    size,
    extension: ext
  };
};

/** ✅ ย้ายจาก temp -> uploads/<ticketId>/<type> (กัน EXDEV + กันรีไทร) */
exports.moveTempToPermanent = async (meta, ticketId) => {
  if (!meta || !meta.path) throw new Error('meta.path is required');

  // รองรับกรณี meta.path มี '/' นำหน้า
  const rel = relPath(meta.path); // ตัด / นำหน้าออกถ้ามี
  const srcAbs = path.join(ROOT_DIR, rel); // .../src/line/<rel>

  // หา type
  const type = typeDir(meta.type || (rel.split('/')[2] /* uploads/temp/<type>/... */) || 'file');

  const destDirAbs = await ensureDir(path.join(UPLOAD_ROOT, String(ticketId), type));
  const destAbs = path.join(destDirAbs, path.basename(srcAbs));

  // กันรีไทร: ถ้าปลายทางมีอยู่แล้ว ให้ถือว่าย้ายเสร็จแล้ว
  if (await safeStat(destAbs)) {
    return {
      ...meta,
      path: relPath('uploads', String(ticketId), type, path.basename(destAbs))
    };
  }

  // ถ้าต้นทางหาย แต่ปลายทางดันมีแล้ว (เคยย้ายสำเร็จรอบก่อน) → ถือว่าสำเร็จ
  const srcStat = await safeStat(srcAbs);
  if (!srcStat) {
    if (await safeStat(destAbs)) {
      return {
        ...meta,
        path: relPath('uploads', String(ticketId), type, path.basename(destAbs))
      };
    }
    // ไม่มีกันทั้งคู่ → แจ้งชัด ๆ
    throw new Error(`Source not found for move: ${srcAbs}`);
  }

  // ย้าย (รองรับ EXDEV)
  await moveFileAcrossFS(srcAbs, destAbs);

  return {
    ...meta,
    path: relPath('uploads', String(ticketId), type, path.basename(destAbs))
  };
};

/** ✅ ลบไฟล์ temp จาก session (กรณีผู้ใช้ยกเลิก) */
exports.deleteTempFiles = async (sess) => {
  const items = (sess?.data?.pending_files || []);
  for (const m of items) {
    try {
      const rel = relPath(m.path || '');
      if (!rel) continue;
      const abs = path.join(ROOT_DIR, rel);
      await fsp.unlink(abs);
    } catch (_) { /* เงียบไป */ }
  }
};

/** ✅ ลบทั้งโฟลเดอร์ของ ticket */
exports.deleteTicketFolder = async (ticketId) => {
  const folderPath = path.join(UPLOAD_ROOT, String(ticketId));
  try {
    await fsp.rm(folderPath, { recursive: true, force: true });
    console.log(`🗑️ ลบโฟลเดอร์แนบ ticket-${ticketId} แล้ว`);
  } catch (err) {
    console.error(`❌ ลบโฟลเดอร์แนบไม่สำเร็จ ticket-${ticketId}:`, err.message);
  }
};

/** ✅ เก็บกวาด temp เก่ากว่า maxAgeMinutes นาที */
exports.cleanOldTempFiles = (maxAgeMinutes = 60) => {
  const subfolders = ['image', 'video', 'file'];
  const now = Date.now();

  subfolders.forEach((sub) => {
    const folder = path.join(TEMP_ROOT, sub);
    if (!fs.existsSync(folder)) return;
    fs.readdir(folder, (err, files) => {
      if (err) return console.error(`❌ อ่าน ${folder} ไม่ได้:`, err.message);
      files.forEach((file) => {
        const fullPath = path.join(folder, file);
        fs.stat(fullPath, (err2, stats) => {
          if (err2) return;
          if (now - stats.mtimeMs > maxAgeMinutes * 60 * 1000) {
            fs.unlink(fullPath, (e3) => { if (!e3) console.log(`🧹 ลบ temp เก่า: ${fullPath}`); });
          }
        });
      });
    });
  });
};

/** (optional) debug paths */
exports.pathsDebug = () => ({ ROOT_DIR, UPLOAD_ROOT, TEMP_ROOT });
