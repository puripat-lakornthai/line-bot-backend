// server/src/line/models/sessionModel.js

const db = require('../../config/db'); // เชื่อม MySQL

// ดึง session จาก line_user_id
exports.getSessionByLineUserId = async (lineUserId) => {
  const rows = await db.query(
    'SELECT * FROM user_sessions WHERE line_user_id = ?',
    [lineUserId]
  );
  return rows[0] || null;
};

// สร้างหรืออัปเดต session
exports.createOrUpdateSession = async (lineUserId, step = 'idle', data = {}, retryCount = 0) => {
  const jsonData = JSON.stringify(data || {}); // ป้องกัน null
  await db.query(
    `INSERT INTO user_sessions (line_user_id, step, data, retry_count)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       step = VALUES(step),
       data = VALUES(data),
       retry_count = VALUES(retry_count),
       updated_at = CURRENT_TIMESTAMP`,
    [lineUserId, step, jsonData, retryCount]
  );
};

// อัปเดต session เฉพาะบาง field
exports.updateSession = async (lineUserId, updates = {}) => {
  const step = updates.step || 'idle';
  const data = JSON.stringify(updates.data || {});
  const retryCount = updates.retryCount || 0;
  await db.query(
    `UPDATE user_sessions SET step = ?, data = ?, retry_count = ?, updated_at = CURRENT_TIMESTAMP
     WHERE line_user_id = ?`,
    [step, data, retryCount, lineUserId]
  );
};

// ลบ session ทิ้ง (ใช้ตอนเริ่มใหม่)
exports.clearSession = async (lineUserId) => {
  await db.query(
    'DELETE FROM user_sessions WHERE line_user_id = ?',
    [lineUserId]
  );
};
