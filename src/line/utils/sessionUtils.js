// server/src/line/utils/sessionUtils.js
const sessionStore = require('../services/sessionService');
const { pushDone } = require('../utils/lineClient'); // ใช้ push แจ้งเมื่อหมดอายุ

// ป้องกันบอทตอบถี่เกินไป จะคูลดาวน์ 5 วินาที หลังจากตอบ รับไฟล์แล้ว!
const ACK_COOLDOWN_MS = 5000; // 5 วินาที

// กำหนดอายุ session ถ้าเงียบเกินเวลานี้จะหมดอายุ
const EXPIRE_MS = 25000; // 25 วินาที

// เก็บ timer ของแต่ละ user
const expireTimers = new Map();

// ตั้ง/รีเซ็ต timer เพื่อ push แจ้งหมดอายุอัตโนมัติ
const armExpirePush = (uid, sess) => {
  if (expireTimers.has(uid)) {
    clearTimeout(expireTimers.get(uid));
    expireTimers.delete(uid);
  }

  const msLeft = (sess?.expiresAt || 0) - Date.now();
  if (!msLeft || msLeft <= 0) {
    console.log('[TTL] skip arm: no msLeft', { uid, msLeft, expiresAt: sess?.expiresAt });
    return;
  }

  console.log('[TTL] arm timer', { uid, msLeft });

  const t = setTimeout(async () => {
    try {
      console.log('[TTL] timer fired', { uid });

      const latest = await sessionStore.getSession(uid);
      if (!latest) {
        console.log('[TTL] no session on fire -> stop', { uid });
        return;
      }

      // 🔧 จุดแก้: ถ้า expiresAt หาย ให้ถือว่า "หมดอายุแล้ว"
      const isExpired = !latest.expiresAt || Date.now() > latest.expiresAt;
      const alreadyNotified = Boolean(latest?.data?.expiredNotified);

      if (isExpired && !alreadyNotified) {
        console.log('[TTL] expired & not-notified -> push', {
          uid,
          expiresAt: latest.expiresAt,
        });

        // mark ว่าเตือนไปแล้ว + seed เป็น idle + ต่อ TTL ใหม่
        const seeded = {
          ...latest,
          step: 'idle',
          data: { ...(latest.data || {}), expiredNotified: true },
          retryCount: 0,
          expiresAt: Date.now() + EXPIRE_MS,
        };
        await sessionStore.setSession(uid, seeded);

        try {
          await pushDone(
            uid,
            'เซสชันของคุณหมดอายุระหว่างการแจ้งปัญหา กรุณาพิมพ์ "แจ้งปัญหา" เพื่อเริ่มต้นใหม่'
          );
          console.log('[TTL] push sent', { uid });
        } catch (e) {
          console.error('[TTL] push error:', e?.message || e);
        }

        // ตั้ง timer รอบใหม่
        armExpirePush(uid, seeded);
      } else {
        console.log('[TTL] not expired or already notified', {
          uid,
          isExpired,
          alreadyNotified,
          expiresAt: latest.expiresAt,
        });
      }
    } catch (e) {
      console.error('[TTL] timer handler error:', e?.message || e);
    }
  }, msLeft + 50);

  expireTimers.set(uid, t);
};

/**
 * ฟังก์ชันเดียวรวมเช็ก TTL + ต่ออายุ Time To Live
 * - ถ้าไม่มี session -> seed ใหม่คืน { session, expired:false, wasWarned:false }
 * - ถ้า session หมดอายุ -> seed ใหม่ และคืน { session, expired:true, wasWarned, expiredAt }
 * - ถ้ายังไม่หมด -> ต่อ TTL แล้วคืน session ใหม่
 */
const checkAndRefreshTTL = async (uid, sess) => {
  // ไม่มี session -> seed เป็น idle + TTL
  if (!sess) {
    const seeded = {
      step: 'idle',
      data: { warned: false, expiredNotified: false },
      retryCount: 0,
      expiresAt: Date.now() + EXPIRE_MS,
    };
    await sessionStore.setSession(uid, seeded);
    armExpirePush(uid, seeded);
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
    armExpirePush(uid, seeded);
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
  armExpirePush(uid, next);
  return { session: next, expired: false, wasWarned: Boolean(sess?.data?.warned) };
};

// เพิ่มตัวนับการกรอกผิดใน session
const increaseRetry = async (uid, sess) => {
  const retry = (sess.retryCount || 0) + 1;
  const next = { ...sess, retryCount: retry, expiresAt: Date.now() + EXPIRE_MS };
  await sessionStore.setSession(uid, next);
  armExpirePush(uid, next);
  return retry;
};

// ตรวจสอบว่าเกินเวลาคูลดาวน์หรือยัง จะคูลดาวน์ 5 วินาที หลังจากตอบ รับไฟล์แล้ว!
const canReplyAcknowledge = async (uid, sess, typeKey) => {
  const now = Date.now();

  // กัน null/undefined
  sess.data = sess.data || {};
  sess.data.lastAckTsByType = sess.data.lastAckTsByType || {};

  const last = sess.data.lastAckTsByType[typeKey] || 0;

  if (now - last >= ACK_COOLDOWN_MS) {
    sess.data.lastAckTsByType[typeKey] = now;
    await sessionStore.setSession(uid, sess); // persist ก่อนคืนค่า
    armExpirePush(uid, sess);
    return true; // อนุญาตให้ reply
  }
  return false; // ยังไม่ถึงเวลา
};

// บันทึก metadata ของไฟล์ลงใน session หลังโหลด media สำเร็จ
const saveToSession = async (uid, sess, meta) => {
  sess.data = sess.data || {};
  sess.data.pending_files = sess.data.pending_files || [];
  sess.data.pending_files.push(meta);
  const next = { ...sess, expiresAt: Date.now() + EXPIRE_MS };
  await sessionStore.setSession(uid, next);
  armExpirePush(uid, next);
};

module.exports = {
  EXPIRE_MS,
  checkAndRefreshTTL,
  increaseRetry,
  canReplyAcknowledge,
  saveToSession,
};
