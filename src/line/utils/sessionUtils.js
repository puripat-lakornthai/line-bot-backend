// server/src/line/utils/sessionUtils.js
const sessionStore = require('../services/sessionService');

// ป้องกันบอทตอบถี่เกินไป จะคูลดาวน์ 5 วินาที หลังจากตอบ รับไฟล์แล้ว!
const ACK_COOLDOWN_MS = 5000; // 5 วินาที

// กำหนดอายุ session ถ้าเงียบเกินเวลานี้จะหมดอายุ
const EXPIRE_MS = 15 * 60 * 1000; // 15 นาที (ปรับได้ตามต้องการ)

/**
 * ฟังก์ชันเดียวรวมเช็ก TTL + ต่ออายุ Time To Live
 * - ถ้า session หมดอายุ -> คืน { session: null, expired: true }
 * - ถ้ายังไม่หมด -> ต่อ TTL แล้วคืน session ใหม่
 */
const checkAndRefreshTTL = async (uid, sess) => {
  if (!sess) return { session: null, expired: false };

  const expired = sess.expiresAt && Date.now() > sess.expiresAt;
  if (expired) {
    return { session: null, expired: true };
  }

  const next = { ...sess, expiresAt: Date.now() + EXPIRE_MS };
  await sessionStore.setSession(uid, next);
  return { session: next, expired: false };
};

// เพิ่มตัวนับการกรอกผิดใน session
const increaseRetry = async (uid, sess) => {
  const retry = (sess.retryCount || 0) + 1;
  await sessionStore.setSession(uid, { ...sess, retryCount: retry });
  return retry;
};

// ตรวจสอบว่าเกินเวลาคูลดาวน์หรือยัง จะคูลดาวน์ 5 วินาที หลังจากตอบ รับไฟล์แล้ว!
// ปรับให้ atomic ถ้าอนุญาต จะอัปเดต timestamp และ setSession ทันที
const canReplyAcknowledge = async (uid, sess, typeKey) => {
  const now = Date.now();

  // กัน null/undefined
  sess.data = sess.data || {};
  sess.data.lastAckTsByType = sess.data.lastAckTsByType || {};

  const last = sess.data.lastAckTsByType[typeKey] || 0;

  if (now - last >= ACK_COOLDOWN_MS) {
    sess.data.lastAckTsByType[typeKey] = now;
    await sessionStore.setSession(uid, sess); // persist ก่อนคืนค่า
    return true; // อนุญาตให้ reply
  }
  return false; // ยังไม่ถึงเวลา
};

// บันทึก metadata ของไฟล์ลงใน session หลังโหลด media สำเร็จ
const saveToSession = async (uid, sess, meta) => {
  sess.data = sess.data || {};
  sess.data.pending_files = sess.data.pending_files || [];
  sess.data.pending_files.push(meta);
  await sessionStore.setSession(uid, sess);
};

module.exports = {
  EXPIRE_MS,
  checkAndRefreshTTL,
  increaseRetry,
  canReplyAcknowledge,
  saveToSession,
};
