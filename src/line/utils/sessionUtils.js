// server/src/line/utils/sessionUtils.js
const sessionStore = require('../services/sessionService');
const { pushDone } = require('../utils/lineClient'); // ใช้ push แจ้งเมื่อหมดอายุ

// ป้องกันบอทตอบถี่เกินไป จะคูลดาวน์ 5 วินาที หลังจากตอบ รับไฟล์แล้ว!
const ACK_COOLDOWN_MS = 5000; // 5 วินาที

// กำหนดอายุ session ถ้าเงียบเกินเวลานี้จะหมดอายุ
const EXPIRE_MS = 50000; // 50 วินาที

// เก็บ timer ของแต่ละ user
const expireTimers = new Map();

// ตั้ง/รีเซ็ต timer เพื่อ push แจ้งหมดอายุอัตโนมัติ
const armExpirePush = (uid, sess) => {
  // ข้ามทันทีถ้าไม่มี session หรืออยู่สถานะ idle (ไม่ได้ทำฟอร์มอยู่)
  if (!sess || sess.step === 'idle') return;

  // เคลียร์ timer เดิมของ user นี้ก่อนตั้งใหม่ (กันซ้อน/กันยิงซ้ำ)
  if (expireTimers.has(uid)) {
    clearTimeout(expireTimers.get(uid));
    expireTimers.delete(uid);
  }

  // เวลาที่เหลือก่อนหมดอายุ (มิลลิวินาที)
  const msLeft = (sess?.expiresAt || 0) - Date.now();
  if (!msLeft || msLeft <= 0) return; // ถ้าไม่เหลือเวลาแล้ว ไม่ต้องตั้ง timer

  // ตั้ง timer ให้ทำงานหลังครบกำหนด + เผื่อ 50ms หรือ 0.05 วินาที กันขอบเวลา
  const t = setTimeout(async () => {
    try {
      // ดึง session ล่าสุดมาก่อน ป้องกันข้อมูลเก่า
      const latest = await sessionStore.getSession(uid);
      if (!latest) return; // ถ้าไม่มีแล้วก็จบ

      // ถือว่าหมดอายุถ้าไม่มี expiresAt หรือเวลาปัจจุบันเกิน
      const isExpired = !latest.expiresAt || Date.now() > latest.expiresAt;

      // กันการแจ้งซ้ำในรอบเดียวกันด้วย flag นี้
      const alreadyNotified = Boolean(latest?.data?.expiredNotified);

      // push เฉพาะกรณี: หมดอายุจริง + ยังไม่เคยเตือน + ยังอยู่ขั้นทำฟอร์ม (ไม่ใช่ idle)
      if (isExpired && !alreadyNotified && latest.step !== 'idle') {
        // seed กลับไป idle พร้อม mark ว่ามีการเตือนแล้ว และยืด TTL รอบใหม่
        const seeded = {
          ...latest,
          step: 'idle',
          data: { ...(latest.data || {}), expiredNotified: true },
          retryCount: 0,
          expiresAt: Date.now() + EXPIRE_MS,
        };
        await sessionStore.setSession(uid, seeded);

        // ส่ง push แจ้งผู้ใช้ (ไม่มี replyToken แล้วเพราะอยู่นอก event เดิม)
        try {
          await pushDone(
            uid,
            'เซสชันของคุณหมดอายุระหว่างการแจ้งปัญหา กรุณาพิมพ์ "แจ้งปัญหา" เพื่อเริ่มต้นใหม่'
          );
          console.log('[TTL] push sent:', { uid });
        } catch (e) {
          console.error('[TTL] push error:', e?.message || e);
        }

        // ตอนนี้สถานะเป็น idle แล้ว ไม่ต้อง arm timer ต่อที่นี่
        return;
      }

      // หมดอายุขณะ idle หรือเคยแจ้งไปแล้วจะไม่ทำอะไร
    } catch (e) {
      console.error('[TTL] timer handler error:', e?.message || e);
    }
  }, msLeft + 50);

  // เก็บตัวอ้างอิง timer ไว้ใน Map เพื่อให้เคลียร์ได้ตอนมีอัปเดตใหม่
  expireTimers.set(uid, t);
};

/**
 * ฟังก์ชันเดียวรวมเช็ก TTL + ต่ออายุ Time To Live
 * - ถ้าไม่มี session -> seed ใหม่คืน { session, expired:false, wasWarned:false }
 * - ถ้า session หมดอายุ -> seed ใหม่ และคืน { session, expired:true, wasWarned, expiredAt }
 * - ถ้ายังไม่หมด -> ต่อ TTL แล้วคืน session ใหม่
 */
const checkAndRefreshTTL = async (uid, sess) => {
  // ไม่มี session -> seed เป็น idle + TTL (ไม่ arm timer ตอน idle)
  if (!sess) {
    const seeded = {
      step: 'idle',
      data: { warned: false, expiredNotified: false },
      retryCount: 0,
      expiresAt: Date.now() + EXPIRE_MS,
    };
    await sessionStore.setSession(uid, seeded);
    // ไม่ arm ตอน idle
    return { session: seeded, expired: false, wasWarned: false };
  }

  const isExpired = sess.expiresAt && Date.now() > sess.expiresAt;
  if (isExpired) {
    const expiredAt = sess.expiresAt;
    const seeded = {
      step: 'idle',
      data: { ...(sess.data || {}) },
      retryCount: 0,
      expiresAt: Date.now() + EXPIRE_MS,
    };
    await sessionStore.setSession(uid, seeded);
    // กลับมา idle แล้ว ไม่ arm
    return {
      session: seeded,
      expired: true,
      wasWarned: Boolean(sess?.data?.warned),
      expiredAt,
    };
  }

  // ต่ออายุ TTL ปกติ
  const next = { ...sess, expiresAt: Date.now() + EXPIRE_MS };
  await sessionStore.setSession(uid, next);
  // arm เฉพาะกรณีที่กำลังอยู่ใน flow (ไม่ใช่ idle)
  armExpirePush(uid, next);
  return { session: next, expired: false, wasWarned: Boolean(sess?.data?.warned) };
};

// เพิ่มตัวนับการกรอกผิดใน session
const increaseRetry = async (uid, sess) => {
  const retry = (sess.retryCount || 0) + 1;
  const next = { ...sess, retryCount: retry, expiresAt: Date.now() + EXPIRE_MS };
  await sessionStore.setSession(uid, next);
  armExpirePush(uid, next); // เฉพาะตอนกำลังทำ flow อยู่เท่านั้น (next.step ไม่ใช่ idle)
  return retry;
};

// ตรวจสอบว่าเกินเวลาคูลดาวน์หรือยัง จะคูลดาวน์ 5 วินาที หลังจากตอบ รับไฟล์แล้ว!
const canReplyAcknowledge = async (uid, sess, typeKey) => {
  const now = Date.now();
  sess.data = sess.data || {};
  sess.data.lastAckTsByType = sess.data.lastAckTsByType || {};
  const last = sess.data.lastAckTsByType[typeKey] || 0;

  if (now - last >= ACK_COOLDOWN_MS) {
    sess.data.lastAckTsByType[typeKey] = now;
    await sessionStore.setSession(uid, sess);
    armExpirePush(uid, sess); // เฉพาะตอนกำลังทำ flow
    return true;
  }
  return false;
};

// บันทึก metadata ของไฟล์ลงใน session หลังโหลด media สำเร็จ
const saveToSession = async (uid, sess, meta) => {
  sess.data = sess.data || {};
  sess.data.pending_files = sess.data.pending_files || [];
  sess.data.pending_files.push(meta);
  const next = { ...sess, expiresAt: Date.now() + EXPIRE_MS };
  await sessionStore.setSession(uid, next);
  armExpirePush(uid, next); // อยู่ในขั้นแนบไฟล์ arm ได้
};

module.exports = {
  EXPIRE_MS,
  checkAndRefreshTTL,
  increaseRetry,
  canReplyAcknowledge,
  saveToSession,
};
