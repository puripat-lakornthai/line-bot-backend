const sessionStore = require('../services/sessionService');
const { reply } = require('./lineClient');

const ACK_COOLDOWN_MS = 5000;

// เพิ่มตัวนับการกรอกผิดใน session
const increaseRetry = async (uid, sess) => {
  const retry = (sess.retryCount || 0) + 1;
  await sessionStore.setSession(uid, { ...sess, retryCount: retry });
  return retry;
};

// ตรวจสอบว่าเกินเวลาคูลดาวน์หรือยัง
const maybeReplyUploading = async (event, sess, tag, typeKey) => {
  const now = Date.now();

  sess.data.lastAckTsByType = sess.data.lastAckTsByType || {};
  const last = sess.data.lastAckTsByType[typeKey] || 0;

  if (now - last >= ACK_COOLDOWN_MS) {
    sess.data.lastAckTsByType[typeKey] = now;
    await sessionStore.setSession(event.source.userId, sess);
    await reply(event.replyToken, `${tag} รับไฟล์แล้ว! กำลังอัปโหลด…`);
    return true;
  }
  return false;
};

// บันทึก metadata ของไฟล์ลงใน session หลังโหลด media สำเร็จ
const saveToSession = async (uid, sess, meta) => {
  sess.data.pending_files = sess.data.pending_files || [];
  sess.data.pending_files.push(meta);
  await sessionStore.setSession(uid, sess);
};

module.exports = {
  increaseRetry,
  maybeReplyUploading,
  saveToSession,
};
