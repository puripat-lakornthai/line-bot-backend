// server/src/handlers/handleTextMessage.js

// handleTextMessage.js
// ใช้จัดการข้อความประเภท text ที่ส่งมาจากผู้ใช้ LINE
// ทำหน้าที่ควบคุม flow การแจ้งปัญหาแบบ step-by-step ผ่าน session

const sessionStore = require('../services/sessionService');
const Ticket = require('../../models/ticketModel');
const User = require('../../models/userModel');
const { reply } = require('../utils/lineClient');
const { isSpammyText, isInvalidPhone, isInvalidName } = require('../utils/validators');
const { moveTempToPermanent, deleteTempFiles } = require('../services/mediaService');
const { increaseRetry } = require('../utils/sessionUtils');

// ฟังก์ชันหลักสำหรับจัดการข้อความที่เป็นข้อความตัวอักษรจากผู้ใช้
const handleTextMessage = async (event) => {
  const uid = event.source.userId;
  const text = event.message.text.trim();
  const lower = text.toLowerCase();

  // หากผู้ใช้พิมพ์ว่า "ดูงานของฉัน" แสดงรายการ ticket ที่เคยแจ้ง และเพราะมันไม่ต้องมี session มันดูได้ตลอด
  if (lower === 'ดูงานของฉัน') {
    const list = await Ticket.getTicketsByLineUserId(uid);
    if (!list.length) return reply(event.replyToken, 'คุณยังไม่มีงานที่แจ้งเข้ามา');
    const info = list.map(t => `#${t.ticket_id} - ${t.title} (${t.status})`).join('\n');
    return reply(event.replyToken, `คุณมีทั้งหมด ${list.length} งาน:\n\n${info}`);
  }

  /* ทำให้บอก user ว่า session หมดอายุ 1 ครั้งก่อน ถ้า user พิมพ์มาอีกครั้งให้ทักทายไป*/
  // โหลด session ล่าสุดจาก store
  let sess = await sessionStore.getSession(uid);

  // หากผู้ใช้พิมพ์ว่า "ยกเลิก" → ล้าง session และลบไฟล์ temp
  if (lower === 'ยกเลิก') {
    if (sess) {
      sess.cancelled = true; // ติดธงว่าเป็นการยกเลิก
      await sessionStore.setSession(uid, sess); // เซฟสถานะก่อนล้าง
      deleteTempFiles(sess); // ลบไฟล์ที่ค้างอยู่ (ยังไม่ได้แนบ)
    }

    // ตั้ง session เป็น idle และบันทึกว่าเตือนไปแล้ว (warned = true)
    await sessionStore.setSession(uid, {
      step: 'idle',
      data: { warned: true },
      retryCount: 0,
    });

    return reply(event.replyToken, 'ยกเลิกแล้ว หากต้องการเริ่มใหม่ พิมพ์ "แจ้งปัญหา"');
  }

  // ตรวจว่า session หมดอายุ (หรือยังไม่มี)
  if (!sess || !sess.step) {
    if (lower === 'แจ้งปัญหา') {
      // ถ้าเริ่มใหม่ด้วย "แจ้งปัญหา"
      await sessionStore.setSession(uid, {
        step: 'ask_name',
        data: { lastAckTs: 0 },
        retryCount: 0,
      });
      return reply(event.replyToken, 'กรุณาระบุชื่อของคุณ');
    }

    // ถ้ายังไม่ได้เคยแจ้งว่า session หมดอายุเตือนครั้งเดียว
    if (!sess?.data?.warned) {
      await sessionStore.setSession(uid, {
        step: 'idle',
        data: { warned: true }, // บันทึกว่าเตือนไปแล้ว
        retryCount: 0,
      });
      return reply(event.replyToken, 'เซสชันของคุณหมดอายุระหว่างการแจ้งปัญหา กรุณาพิมพ์ "แจ้งปัญหา" เพื่อเริ่มต้นใหม่');
    }

    // ถ้าเตือนไปแล้วทักทายเฉยๆ
    return reply(event.replyToken, 'ยินดีต้อนรับ! หากต้องการแจ้งปัญหา กรุณาพิมพ์ "แจ้งปัญหา"');
  }

  // หาก session ยังไม่หมดอายุ และอยู่ในสถานะ idle (ยังไม่เริ่ม)
  if (sess.step === 'idle') {
    if (lower === 'แจ้งปัญหา') {
      await sessionStore.setSession(uid, {
        step: 'ask_name',
        data: { lastAckTs: 0 },
        retryCount: 0,
      });
      return reply(event.replyToken, 'กรุณาระบุชื่อของคุณ');
    }

    return reply(event.replyToken, 'ยินดีต้อนรับ! หากต้องการแจ้งปัญหา กรุณาพิมพ์ "แจ้งปัญหา"');
  }

  // // หากผู้ใช้พิมพ์ว่า "ยกเลิก" ล้าง session และลบไฟล์ temp
  // if (text === 'ยกเลิก') {
  //   if (sess) {
  //     sess.cancelled = true;
  //     await sessionStore.setSession(uid, sess);
  //     deleteTempFiles(sess); // ลบไฟล์ที่ค้างอยู่
  //   }
  //   await sessionStore.clearSession(uid);
  //   return reply(event.replyToken, 'ยกเลิกแล้ว หากต้องการเริ่มใหม่ พิมพ์ "แจ้งปัญหา"');
  // }

  // ทำงานตามขั้นตอนปัจจุบันใน session
  switch (sess.step) {
    case 'ask_name': {
      // ตรวจสอบความถูกต้องของชื่อ
      if (text.length < 2 || isInvalidName(text)) {
        if (await increaseRetry(uid, sess) >= 5) {
          // หากพิมพ์ผิดเกิน 5 ครั้ง → เคลียร์ session
          await sessionStore.clearSession(uid);
          return reply(event.replyToken, 'ลองใหม่อีกครั้ง');
        }
        return reply(event.replyToken, 'กรุณาระบุชื่ออีกครั้ง');
      }

      // บันทึกชื่อ และไปยังขั้นตอนขอเบอร์โทร
      await sessionStore.setSession(uid, {
        step: 'ask_phone',
        data: { ...sess.data, name: text },
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
      await sessionStore.setSession(uid, {
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
        return reply(event.replyToken, 'รายละเอียดสั้นเกินไป กรุณาอธิบายเพิ่ม:');
      }

      // บันทึกรายละเอียด และไปยังขั้นตอนขอระดับความสำคัญ
      await sessionStore.setSession(uid, {
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
        return reply(event.replyToken, 'โปรดพิมพ์เลข 1, 2 หรือ 3 เท่านั้น:');
      }

      // ดึง user_id จาก database หรือลงทะเบียนใหม่หากยังไม่มี
      const requesterId = await User.findOrCreateByLineId(uid, sess.data.name);

      // สร้าง ticket ล่วงหน้า พร้อมเก็บ ticket_id สำหรับใช้ตั้งชื่อไฟล์
      const { insertId: ticketId } = await Ticket.createTicket({
        title: `แจ้งปัญหาจาก ${sess.data.name}`,
        description: sess.data.detail,
        requester_name: sess.data.name,
        requester_phone: sess.data.phone,
        line_user_id: uid,
        priority: Number(text),
        status: 'new',
      });

      // อัปเดต session ด้วย ticket_id และ user_id
      await sessionStore.setSession(uid, {
        step: 'wait_image',
        data: {
          ...sess.data,
          priority: Number(text),
          ticket_id: ticketId,
          user_id: requesterId
        },
        retryCount: 0,
      });

      return reply(event.replyToken, '📎 กรุณาส่งภาพ, ไฟล์, หรือวิดีโอ (พิมพ์ "ไม่มี" หรือ "เสร็จแล้ว" เพื่อจบ)');
    }

    case 'wait_image': {
      // ตรวจสอบว่าผู้ใช้พิมพ์ "ไม่มี" หรือ "เสร็จแล้ว" เพื่อจบการแนบไฟล์
      if (!['ไม่มี', 'เสร็จแล้ว'].includes(lower)) return;

      // ใช้ user_id จาก session (ถูกตั้งไว้ตอนขั้น ask_priority)
      // หากไม่มี ให้ fallback ไปเรียก findOrCreateByLineId เพื่อสร้าง user_id ใหม่
      const requesterId = sess.data.user_id || await User.findOrCreateByLineId(uid, sess.data.name);

      // ใช้ ticket_id จาก session (ถูกสร้างไว้ตอนขั้น ask_priority) ถ้ายังไม่มีจะ fallback ไปสร้างใหม่ด้านล่าง
      let ticketId = sess.data.ticket_id;

      // fallback สร้าง ticket หากยังไม่มี (ไม่ควรเกิดถ้า flow ถูก)
      if (!ticketId) {
        const { insertId } = await Ticket.createTicket({
          title: `แจ้งปัญหาจาก ${sess.data.name}`,
          description: sess.data.detail,
          requester_name: sess.data.name,
          requester_phone: sess.data.phone,
          line_user_id: uid,
          priority: sess.data.priority,
          status: 'new',
        });
        ticketId = insertId;
      }

      // ดึงไฟล์จาก session (ที่เก็บไว้ใน temp) แล้วแนบกับ ticket
      const latestSess = await sessionStore.getSession(uid);
      const pendingFiles = latestSess?.data?.pending_files || [];

      for (const m of pendingFiles) {
        // ย้ายไฟล์จาก temp ไปยังโฟลเดอร์ถาวรของ ticket
        const perm = moveTempToPermanent(m, ticketId);

        // บันทึกไฟล์แนบลงใน database
        await Ticket.addAttachments(
          ticketId,
          [{
            file_name: perm.originalname,
            file_path: perm.path,
            mime_type: perm.mimetype,
            file_size: perm.size,
          }],
          requesterId
        );
      }

      // เคลียร์ session และแจ้งผู้ใช้ว่าสร้าง ticket สำเร็จแล้ว
      await sessionStore.clearSession(uid);

      // ตั้ง session ใหม่เป็น idle + บอกว่าเตือนไปแล้ว (จะได้ไม่โดนเตือนว่า session หมดอายุ)
      await sessionStore.setSession(uid, {
        step: 'idle',
        data: { warned: true },
        retryCount: 0,
      });
      
      return reply(event.replyToken,
        `✅ สร้าง Ticket แล้ว!\nหมายเลข: #${ticketId}\nขอบคุณที่แจ้งปัญหา 🙏\n\nพิมพ์ "ดูงานของฉัน" เพื่อตรวจสอบสถานะ`
      );
    }
  }
};

// export แบบ default สำหรับฟังก์ชันเดียวในไฟล์
module.exports = handleTextMessage;
