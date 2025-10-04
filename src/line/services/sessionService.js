// server/src/line/services/sessionService.js

const sessionModel = require('../models/sessionModel');

// กำหนดเวลาหมดอายุของ session (นาที)
const SESSION_TIMEOUT_MINUTES = 10;

// ดึง session ของผู้ใช้จากฐานข้อมูล
// พร้อมตรวจสอบว่า session หมดอายุแล้วหรือยัง
exports.getSession = async (lineUserId) => {
  const session = await sessionModel.getSessionByLineUserId(lineUserId);

  // ถ้ายังไม่มี session เลย (ไม่เคยเริ่มแจ้งปัญหา)
  if (!session) return null;

  // คำนวณเวลาที่ผ่านไปนับจากอัปเดต session ล่าสุด
  const lastUpdated = new Date(session.updated_at).getTime();
  const now = Date.now();
  const diffMinutes = (now - lastUpdated) / (1000 * 60); // แปลงเป็นนาที

  // ถ้าเกินเวลาที่กำหนด ถือว่า session หมดอายุ
  if (diffMinutes > SESSION_TIMEOUT_MINUTES) {
    console.log(`⚠️ Session expired (${diffMinutes.toFixed(1)} mins ago) for user ${lineUserId}`);
    await sessionModel.clearSession(lineUserId);
    return null; // คืน null แทน idle เพื่อให้ handleTextMessage ตรวจจับได้
  }

  // คืนค่าข้อมูล session ที่ยังใช้ได้
  return {
    step: session.step,
    data: JSON.parse(session.data || '{}'),
    retryCount: session.retry_count || 0,
  };
};

// บันทึกหรืออัปเดต session ของผู้ใช้ลงในฐานข้อมูล
exports.setSession = async (lineUserId, session) => {
  const { step, data, retryCount } = session;
  await sessionModel.createOrUpdateSession(lineUserId, step, data, retryCount);
};

// ล้าง session ของผู้ใช้ (ใช้เมื่อต้องการเริ่มใหม่)
exports.clearSession = async (lineUserId) => {
  await sessionModel.clearSession(lineUserId);
};
