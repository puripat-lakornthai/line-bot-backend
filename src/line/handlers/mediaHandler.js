// server/src/handlers/mediaHandler.js

// mediaHandler.js สำหรับจัดการข้อความประเภทสื่อจากผู้ใช้ LINE (ภาพ / ไฟล์ / วิดีโอ)

const { downloadLineMedia, deleteTempFiles } = require('../services/mediaService');
const { maybeReplyUploading, saveToSession } = require('../utils/sessionUtils');
const sessionStore = require('../services/sessionService');
const { pushDone } = require('../utils/lineClient');

// ฟังก์ชันสร้าง handler สำหรับสื่อแต่ละประเภท เช่น ภาพ / ไฟล์ / วิดีโอ
// tag      : ใช้แสดงไอคอน เช่น '📷'
// kindTH   : ชื่อภาษาไทยของ media เช่น 'ภาพ'
// typeKey  : ใช้แยกประเภทใน session เช่น 'image' / 'file' / 'video'
const makeMediaHandler = (tag, kindTH, typeKey) => async (event) => {
  const uid = event.source.userId;

  // โหลด session ล่าสุดของผู้ใช้
  let sess = await sessionStore.getSession(uid);
  if (!sess || sess.step !== 'wait_image') return;

  // ป้องกันการตอบข้อความซ้ำกรณีส่งไฟล์รัว ๆ
  const didReply = await maybeReplyUploading(event, sess, tag, typeKey);

  // async IIFE เพื่อให้ error ดักได้แยกจาก flow หลัก
  (async () => {
    try {
      // ดึง ticketId และ userId จาก session (หากมี)
      const ticketId = sess?.data?.ticket_id;
      const userId = sess?.data?.user_id;

      // ดาวน์โหลด media พร้อมตั้งชื่อด้วย ticketId + userId
      const meta = await downloadLineMedia(event.message, uid, ticketId, userId);

      // โหลด session อีกรอบเพื่อเช็กว่าผู้ใช้ยกเลิกหรือ session เปลี่ยนระหว่างรอ
      const latest = await sessionStore.getSession(uid);
      if (!latest || latest.cancelled) {
        // ถ้าถูกยกเลิก ให้ลบไฟล์ temp ทิ้ง
        await deleteTempFiles({ data: { pending_files: [meta] } });
        return;
      }

      // บันทึก metadata ของไฟล์ลงใน session (ไม่เก็บ buffer จริง)
      await saveToSession(uid, latest, { ...meta, type: kindTH });

      // ถ้าตอบไปแล้วว่า "รับภาพแล้ว!" ก่อนหน้า → แจ้งผลการบันทึก
      if (didReply) await pushDone(uid, `✅ บันทึก${kindTH}เรียบร้อยแล้ว!`);
    } catch (e) {
      const msg = e.message.includes('ไฟล์ของคุณมีขนาด')
        ? `${e.message}\nกรุณาส่ง${kindTH}ที่เล็กกว่านี้`
        : `ไม่สามารถบันทึก${kindTH}ได้ กรุณาลองใหม่`;
      await pushDone(uid, `❌ ${msg}`);
      console.error(`[${kindTH}]`, e);
    }
  })();
};

// export handler สำหรับใช้ใน lineMessageService.js export แบบ object literal
module.exports = {
  handleImageMessage: makeMediaHandler('📷', 'ภาพ', 'image'),
  handleFileMessage: makeMediaHandler('📎', 'ไฟล์', 'file'),
  handleVideoMessage: makeMediaHandler('🎞️', 'วิดีโอ', 'video'),
};
