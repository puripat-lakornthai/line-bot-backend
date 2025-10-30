// handleTextMessage.js
// ใช้จัดการข้อความประเภท text ที่ส่งมาจากผู้ใช้ LINE
// ทำหน้าที่ควบคุม flow การแจ้งปัญหาแบบ step-by-step ผ่าน session

const sessionStore = require('../services/sessionService');
const Ticket = require('../../models/ticketModel');
const User = require('../../models/userModel');
const { reply } = require('../utils/lineClient');
const { isSpammyText, isInvalidPhone, isInvalidName } = require('../utils/validators');
const { moveTempToPermanent, deleteTempFiles } = require('../services/mediaService');
const { increaseRetry, checkAndRefreshTTL } = require('../utils/sessionUtils');

// ใช้ในช่วงรีเนมหลังย้ายไฟล์
const fs = require('fs');
const path = require('path');

// ป้ายสถานะของ Tickets
const statusLabel = {
  new: 'ใหม่',
  assigned: 'มอบหมายแล้ว',
  in_progress: 'กำลังดำเนินการ',
  pending: 'รอข้อมูลเพิ่มเติม',
  resolved: 'แก้ไขแล้ว',
  closed: 'ปิดงานแล้ว',
};

// ฟังก์ชันหลักสำหรับจัดการข้อความที่เป็นข้อความตัวอักษรจากผู้ใช้
const handleTextMessage = async (event) => {
  const uid = event.source.userId;
  const text = event.message.text.trim();
  const lower = text.toLowerCase();

  await User.findOrCreateByLineId(uid);

  // หากผู้ใช้พิมพ์ว่า "ดูปัญหาของฉัน" แสดงรายการ ticket ที่เคยแจ้ง และเพราะมันไม่ต้องมี session มันดูได้ตลอด
  if (lower === 'ดูปัญหาของฉัน') {
    const list = await Ticket.getTicketsByLineUserId(uid);
    if (!list.length) return reply(event.replyToken, 'คุณยังไม่มีงานที่แจ้งเข้ามา');
    const info = list.map(t => `#${t.ticket_id} - ${t.title} (${statusLabel[t.status] || t.status})`).join('\n');
    return reply(event.replyToken, `คุณมีปัญหาที่แจ้งทั้งหมด ${list.length} งาน\n\n${info}`);
  }

  /* โหลด session ล่าสุดจาก store (ยังไม่ต่อ TTL) */
  const rawSess = await sessionStore.getSession(uid);

  // ตอนนี้ค่อย "ต่อ TTL" ปกติ เพื่อทำงานขั้นต่อไป
  const { session: refreshedSess } = await checkAndRefreshTTL(uid, rawSess);
  let sess = refreshedSess;

  // หากผู้ใช้พิมพ์ว่า "ยกเลิก" ล้าง session และลบไฟล์ temp
  if (lower === 'ยกเลิก') {
    if (sess) {
      sess.cancelled = true; // ติดธงว่าเป็นการยกเลิก
      await sessionStore.setSession(uid, sess); // เซฟสถานะก่อนล้าง
      await deleteTempFiles(sess); // ลบไฟล์ temp ให้จบก่อน แล้วค่อยตอบกลับ
    }

    // ตั้ง session เป็น idle และบันทึกว่าเตือนไปแล้ว (warned = true) พร้อมต่อ TTL
    await checkAndRefreshTTL(uid, {
      step: 'idle',
      data: { ...(sess?.data || {}), warned: true, expiredNotified: true, expiredFlag: false }, // เปลี่ยนเป็น true กัน push ตอน idle
      retryCount: 0,
    });

    return reply(event.replyToken, 'ยกเลิกแล้ว หากต้องการเริ่มใหม่ พิมพ์ "แจ้งปัญหา"');
  }

  // กรณีอยู่ในสถานะ idle ให้ตอบโต้ทันที (มาก่อนเสมอ)
  if (sess && sess.step === 'idle') {
    if (lower === 'แจ้งปัญหา') {
      await checkAndRefreshTTL(uid, {
        step: 'ask_name',
        data: { ...(sess.data || {}), lastAckTs: 0, expiredNotified: false, expiredFlag: false },
        retryCount: 0,
      });
      return reply(event.replyToken, 'กรุณาระบุชื่อของคุณ');
    }
    // อยู่ idle แล้ว → ทักทายตามที่ต้องการ
    return reply(event.replyToken, 'ยินดีต้อนรับ! หากต้องการแจ้งปัญหา กรุณาพิมพ์ "แจ้งปัญหา"');
  }

// =================================================================================================================================

  // ทำงานตามขั้นตอนปัจจุบันใน session
  switch (sess.step) {
    case 'ask_name': {
      // ตรวจสอบความถูกต้องของชื่อ
      if (text.length < 2 || isInvalidName(text)) {
        if (await increaseRetry(uid, sess) >= 5) {
          // หากพิมพ์ผิดเกิน 5 ครั้ง จะเคลียร์ session
          await sessionStore.clearSession(uid);
          return reply(event.replyToken, 'ลองใหม่อีกครั้ง');
        }
        return reply(event.replyToken, 'กรุณาระบุชื่ออีกครั้ง');
      }

      // ดึง user_id จาก database หรือลงทะเบียนใหม่หากยังไม่มี
      const requesterId = await User.findOrCreateByLineId(uid);

      // บันทึกชื่อ และไปยังขั้นตอนขอเบอร์โทร
      await checkAndRefreshTTL(uid, {
        step: 'ask_phone',
        data: { ...sess.data, name: text, user_id: requesterId  },
        retryCount: 0,
      });
      return reply(event.replyToken, 'กรุณาระบุเบอร์โทรศัพท์');
    }

    case 'ask_phone': {
      // ตรวจสอบความถูกต้องของเบอร์โทรศัพท์
      if (isInvalidPhone(text)) {
        if (await increaseRetry(uid, sess) >= 5) {
          await sessionStore.clearSession(uid);
          return reply(event.replyToken, 'ผิดหลายครั้งแล้ว โปรดลองใหม่');
        }
        return reply(event.replyToken, 'กรุณากรอกเบอร์ให้ถูกต้อง');
      }

      // บันทึกเบอร์โทร และไปยังขั้นตอนขอรายละเอียดปัญหา
      await checkAndRefreshTTL(uid, {
        step: 'ask_detail',
        data: { ...sess.data, phone: text },
        retryCount: 0,
      });
      return reply(event.replyToken, 'โปรดอธิบายปัญหา');
    }

    case 'ask_detail': {
      // ตรวจสอบว่ารายละเอียดสั้นเกินไป หรือเป็นข้อความ spam หรือไม่
      if (text.length < 10 || isSpammyText(text)) {
        if (await increaseRetry(uid, sess) >= 5) {
          await sessionStore.clearSession(uid);
          return reply(event.replyToken, 'เกิดข้อผิดพลาดหลายครั้ง');
        }
        return reply(event.replyToken, 'รายละเอียดสั้นเกินไป กรุณาอธิบายเพิ่ม');
      }

      // บันทึกรายละเอียด และไปยังขั้นตอนขอระดับความสำคัญ
      await checkAndRefreshTTL(uid, {
        step: 'ask_priority',
        data: { ...sess.data, detail: text },
        retryCount: 0,
      });
      return reply(event.replyToken,
        `กรุณาระบุระดับความสำคัญของปัญหา โดยพิมพ์เลข 1, 2 หรือ 3\n\n` +
        `1 - สำคัญมาก (เช่น ระบบใช้งานไม่ได้, มีผลกระทบรุนแรง)\n` +
        `2 - ปานกลาง (มีปัญหาแต่ยังใช้งานได้)\n` +
        `3 - เล็กน้อย (ข้อเสนอแนะ หรือปัญหาย่อย)`
      );
    }

    case 'ask_priority': {
      // ตรวจสอบว่าเลือก priority ถูกต้องหรือไม่ (1, 2, 3)
      if (!['1', '2', '3'].includes(text)) {
        if (await increaseRetry(uid, sess) >= 5) {
          await sessionStore.clearSession(uid);
          return reply(event.replyToken, 'ระบุผิดหลายครั้งเกินไป กรุณาเริ่มใหม่');
        }
        return reply(event.replyToken, 'โปรดพิมพ์เลข 1, 2 หรือ 3 เท่านั้น');
      }

      // ดึง user_id จาก database หรือลงทะเบียนใหม่หากยังไม่มี
      const requesterId = await User.findOrCreateByLineId(uid);

      // ไม่สร้าง ticket ที่ขั้นนี้ — ออก draft_id สำหรับตั้งชื่อไฟล์ temp ให้ไม่เป็น "unknown"
      const draftId = `draft_${uid.slice(-6)}_${Date.now().toString(36)}`;

      // เก็บ draft_id และใช้เป็น ticket_id ชั่วคราว เพื่อให้ mediaHandler/downloadLineMedia ตั้งชื่อไฟล์ temp ได้เลย
      await checkAndRefreshTTL(uid, {
        step: 'wait_image',
        data: {
          ...sess.data,
          priority: Number(text),
          user_id: requesterId,
          draft_id: draftId,
          ticket_id: draftId, // ใช้ชั่วคราวให้ไฟล์ temp 
        },
        retryCount: 0,
      });

      return reply(
        event.replyToken,
        '📎 กรุณาส่งภาพ ไฟล์ หรือวิดีโอที่เกี่ยวข้อง\n' +
        '• พิมพ์ "เสร็จแล้ว" เพื่อยืนยันการแนบไฟล์และบันทึกงาน\n' +
        '• พิมพ์ "ไม่มี" หากไม่ต้องการแนบไฟล์ (จะบันทึกงานเช่นกัน)\n' +
        '• พิมพ์ "ยกเลิก" เพื่อยกเลิกการแจ้งปัญหา'
      );
    }

    case 'wait_image': {
      // ตรวจสอบว่าผู้ใช้พิมพ์ "ไม่มี" หรือ "เสร็จแล้ว" เพื่อจบการแนบไฟล์
      if (!['ไม่มี', 'เสร็จแล้ว'].includes(lower)) return;

      // ใช้ user_id จาก session (ถูกตั้งไว้ตอนขั้น ask_priority)
      // หากไม่มี ให้ fallback ไปเรียก findOrCreateByLineId เพื่อสร้าง user_id ใหม่
      const requesterId = sess.data.user_id || await User.findOrCreateByLineId(uid);

      // ใช้ ticket_id จาก session (ถ้าเป็น draft_ ให้สร้างตัวจริงตอนนี้)
      let ticketId = sess.data.ticket_id;

      // ถ้ายังเป็น draft ให้สร้าง ticket จริงตอนผู้ใช้คอนเฟิร์ม
      if (!ticketId || String(ticketId).startsWith('draft_')) {
        const { insertId } = await Ticket.createTicket({
          title: `${sess.data.name}`,
          description: sess.data.detail,
          requester_name: sess.data.name,
          requester_phone: sess.data.phone,
          line_user_id: uid,
          priority: sess.data.priority,
          status: 'new',
        });
        ticketId = insertId;
        // อัปเดต session ให้รู้ ticket_id จริง แต่เก็บ draft_id เดิมไว้เผื่ออ้างอิงชื่อไฟล์ temp
        await checkAndRefreshTTL(uid, { ...sess, data: { ...sess.data, ticket_id: ticketId } });
      }

      // โหลดไฟล์ temp ที่ค้าง
      const latestSess = await sessionStore.getSession(uid);
      const pendingFiles = latestSess?.data?.pending_files || [];

      // แนบไฟล์ (ถ้ามี) หรือเคลียร์ temp (ถ้าไม่มี)
      if (lower === 'เสร็จแล้ว' && pendingFiles.length > 0) {
        // 🔧 เพิ่มความทนทาน: ข้ามไฟล์ที่ถูกลบไปแล้ว (ENOENT) ไม่ให้ flow พัง
        // const fs = require('fs');
        // const path = require('path');
        const rootDir = path.join(__dirname, '..');

        // ใช้ for-index เพื่อให้ได้ลำดับไฟล์ชัดเจน
        for (let i = 0; i < pendingFiles.length; i++) {
          const m = pendingFiles[i];
          try {
            const srcAbs = path.join(rootDir, m.path);
            if (!fs.existsSync(srcAbs)) {
              // temp ถูกลบไปแล้ว (เช่น cleaner/ผู้ใช้ยกเลิก) → ข้ามไฟล์นี้
              continue;
            }

            // ย้ายไฟล์จาก temp ไปยังโฟลเดอร์ถาวรของ ticket
            const perm = await moveTempToPermanent(m, ticketId);

            // ---- รีเนมชื่อไฟล์ให้ยาวและกันซ้ำ: ticket_<ticketId>_<YYYYMMDD_HHMMSS>_<seq>_<rand4>.<ext>
            let finalName = perm.originalname;
            let finalPath = perm.path;

            const absPerm = path.join(rootDir, perm.path);
            const dirAbs  = path.dirname(absPerm);
            const base    = path.basename(absPerm);
            const ext     = (path.extname(base) || '').toLowerCase();

            // ต้องรีเนมหรือไม่ (กรณียังเป็น ticket_draft_ / ticket_unknown หรือชื่อไม่ตรงรูปแบบใหม่)
            const needRename = /^(ticket_draft_|ticket_unknown)/.test(base);

            // timestamp แบบสั้น YYYYMMDD_HHMMSS
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const ts  = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

            const seq = i + 1;
            const rand = Math.random().toString(36).slice(2, 6);
            const desiredBase = `ticket_${ticketId}_${ts}_${seq}_${rand}${ext || ''}`;
            let destAbs = path.join(dirAbs, desiredBase);

            if (needRename || base !== desiredBase) {
              // กันซ้ำชื่ออีกรอบหากยังชน
              if (fs.existsSync(destAbs)) {
                const rand2 = Math.random().toString(36).slice(2, 6);
                destAbs = path.join(dirAbs, `ticket_${ticketId}_${ts}_${seq}_${rand}_${rand2}${ext || ''}`);
              }
              await fs.promises.rename(absPerm, destAbs);

              finalName = path.basename(destAbs);
              finalPath = path.join(path.dirname(perm.path), finalName).replace(/\\/g, '/');
            }
            // จบ rename

            // บันทึกไฟล์แนบลงใน database ด้วยชื่อ/พาธสุดท้าย
            await Ticket.addAttachments(
              ticketId,
              [{
                file_name: finalName,
                file_path: finalPath,
                mime_type: perm.mimetype,
                file_size: perm.size,
              }],
              requesterId
            );
          } catch (e) {
            if (e && e.code === 'ENOENT') {
              // ถูกลบระหว่างย้าย → ข้ามไฟล์นี้
              continue;
            }
            throw e; // error อื่นให้แจ้งออกไปตามปกติ
          }
        }
      } else if (lower === 'ไม่มี' && pendingFiles.length > 0) {
        // ผู้ใช้ไม่ต้องการแนบไฟล์ → ลบไฟล์ temp ที่ค้างอยู่ทั้งหมด
        await deleteTempFiles(latestSess);
      }

      // เคลียร์ session และแจ้งผู้ใช้ว่าสร้าง ticket สำเร็จแล้ว
      await sessionStore.clearSession(uid);

      // ตั้ง session ใหม่เป็น idle + บอกว่าเตือนไปแล้ว (จะได้ไม่โดนเตือนว่า session หมดอายุ)
      await checkAndRefreshTTL(uid, {
        step: 'idle',
        data: { ...(sess?.data || {}), warned: true, expiredNotified: true, expiredFlag: false }, // เปลี่ยนเป็น true กัน push ตอน idle
        retryCount: 0,
      });

      return reply(event.replyToken,
        `✅ สร้าง Ticket แล้ว!\nหมายเลข #${ticketId}\nขอบคุณที่แจ้งปัญหา 🙏\n\nพิมพ์ "ดูปัญหาของฉัน" เพื่อตรวจสอบสถานะ`
      );
    }
  }
};

// export แบบ default สำหรับฟังก์ชันเดียวในไฟล์
module.exports = handleTextMessage;
