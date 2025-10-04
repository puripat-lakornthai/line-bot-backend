const db = require('../config/db');

// ดึงจำนวน ticket แยกตามสถานะ (status)
exports.getTicketSummary = async () => {
  const sql = `
    SELECT 
      status, 
      COUNT(*) as count 
    FROM tickets 
    GROUP BY status
  `;
  return await db.query(sql);
};

// ดึงรายการ ticket ทั้งหมดเพื่อใช้ในรายงาน
exports.getAllTickets = async () => {
  const sql = `
    SELECT 
      ticket_id, 
      title, 
      status, 
      created_at, 
      updated_at 
    FROM tickets
    ORDER BY created_at DESC
  `;
  return await db.query(sql);
};

// ดึงจำนวนผู้ใช้งานทั่วไป (เฉพาะ role = 'requester') ย้ายไป userModel เพราะมันเกี่ยวกับ user
// exports.getTotalUsers = async () => {
//   const sql = `SELECT COUNT(*) AS total FROM users WHERE role = 'requester'`;
//   const rows = await db.query(sql); // << ตรงนี้ db.query() คืน rows ไปเลย ไม่ต้อง destructure

//   const total = parseInt(rows?.[0]?.total ?? 0, 10);
//   console.log(' TOTAL =', total);

//   return total;
// };


