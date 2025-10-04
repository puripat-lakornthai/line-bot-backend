const db = require('../config/db');

// ดึงข้อมูลจำนวนงานที่พนักงานแต่ละคนรับผิดชอบ พร้อมเบอร์โทรศัพท์
exports.getStaffWorkload = async () => {
  const result = await db.query(`
    SELECT 
      u.user_id,
      u.full_name,
      u.phone,  -- เพิ่มตรงนี้
      COUNT(ta.ticket_id) AS ticket_count
    FROM users u
    LEFT JOIN ticket_assignees ta ON u.user_id = ta.staff_id
    WHERE u.role = 'staff'
    GROUP BY u.user_id, u.full_name, u.phone
    ORDER BY ticket_count ASC;
  `);

  // ดึง rows ให้รองรับทั้งกรณีเป็น [rows] หรือ [[rows], fields]
  const rows = Array.isArray(result)
    ? (Array.isArray(result[0]) ? result[0] : result)
    : [result];

  // console.log("✅ fixed rows:", rows);  // ใช้ตรวจสอบว่า rows เป็น array

  // คืนข้อมูลแต่ละแถว พร้อม fallback ถ้า ticket_count เป็น null
  return rows.map(row => ({
    ...row,
    ticket_count: row.ticket_count ?? 0,
  }));
};

// ดึงรายการ ticket ที่พนักงานรับผิดชอบตาม staffId
exports.getTicketsByAssignee = async (staffId) => {
  const result = await db.query(`
    SELECT 
      t.ticket_id,
      t.title,
      t.status,
      t.updated_at
    FROM tickets t
    INNER JOIN ticket_assignees ta ON t.ticket_id = ta.ticket_id
    WHERE ta.staff_id = ?
    ORDER BY t.updated_at DESC
  `, [staffId]);

  const rows = Array.isArray(result)
    ? (Array.isArray(result[0]) ? result[0] : result)
    : [result];

  return rows;
};