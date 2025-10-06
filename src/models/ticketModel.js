const db = require('../config/db');

// ดึงรายการ ticket ทั้งหมดจากฐานข้อมูล พร้อมรองรับ filter และ pagination (ผ่าน offset + limit)
exports.getAllTicketsWithFilter = async (filters) => {
  // รับค่าจาก controller
  const {
    offset,               // ตำแหน่งเริ่มต้นที่คำนวณจาก controller
    limit,                // จำนวนรายการต่อหน้า
    status,               // กรองสถานะ
    assignee_id,          // กรองผู้รับผิดชอบ
    sort_by = 'updated_at', // คอลัมน์ที่ใช้เรียงข้อมูล
    sort_order = 'DESC'     // ทิศทางเรียง (ASC หรือ DESC)
  } = filters;

  const where = [];       // เก็บเงื่อนไข WHERE
  const params = [];      // เก็บพารามิเตอร์สำหรับ SQL

  // กรองสถานะ (ถ้ามี)
  if (status) {
    where.push('t.status = ?');
    params.push(status);
  }

  // กรองผู้รับผิดชอบ (ถ้ามี)
  if (assignee_id) {
    if (assignee_id === 'null') {
      // เฉพาะ ticket ที่ยังไม่มีผู้รับผิดชอบ
      where.push(`NOT EXISTS (
        SELECT 1 FROM ticket_assignees ta2 WHERE ta2.ticket_id = t.ticket_id
      )`);
    } else {
      // เฉพาะ ticket ที่มีผู้รับผิดชอบตรงกับ ID ที่ระบุ
      where.push(`EXISTS (
        SELECT 1 FROM ticket_assignees ta2 WHERE ta2.ticket_id = t.ticket_id AND ta2.staff_id = ?
      )`);
      params.push(assignee_id);
    }
  }

  // รวม WHERE ทั้งหมด
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // SQL: ดึง ticket ตาม filter พร้อมชื่อผู้รับผิดชอบ (GROUP_CONCAT)
  const ticketsSql = `
    SELECT
      t.ticket_id,
      t.title,
      t.status,
      t.updated_at,
      t.created_at,
      t.requester_name AS requester_fullname,
      GROUP_CONCAT(u.full_name SEPARATOR ', ') AS assignee_fullname
    FROM tickets t
    LEFT JOIN ticket_assignees ta ON t.ticket_id = ta.ticket_id
    LEFT JOIN users u ON ta.staff_id = u.user_id
    ${whereClause}
    GROUP BY t.ticket_id
    ORDER BY t.${sort_by} ${sort_order}
    LIMIT ? OFFSET ?
  `;

  // SQL: นับจำนวนรายการทั้งหมด (ใช้สำหรับคำนวณ totalPages)
  const totalSql = `
    SELECT COUNT(DISTINCT t.ticket_id) AS total
    FROM tickets t
    LEFT JOIN ticket_assignees ta ON t.ticket_id = ta.ticket_id
    ${whereClause}
  `;

  // ดึงข้อมูลพร้อมกันทั้ง tickets และ total
  const [tickets, totalRes] = await Promise.all([
    db.query(ticketsSql, [...params, limit, offset]),
    db.query(totalSql, params)
  ]);

  const total = totalRes[0]?.total || 0; // จำนวนทั้งหมดของ ticket

  return {
    tickets, // รายการ ticket
    total    // จำนวนทั้งหมด
  };
};

// ดึง ticket รายตัว (รวมผู้รับผิดชอบและแนบไฟล์)
exports.getTicketById = async (ticketId) => {
  const ticketSql = `
    SELECT t.*, t.requester_name AS requester_fullname
    FROM tickets t
    WHERE t.ticket_id = ?
  `;
  const result = await db.query(ticketSql, [ticketId]);
  if (!result || result.length === 0) return null;

  const assigneesSql = `
    SELECT u.user_id, u.full_name
    FROM ticket_assignees ta
    JOIN users u ON ta.staff_id = u.user_id
    WHERE ta.ticket_id = ?
  `;
  const attachmentsSql = `SELECT * FROM attachments WHERE ticket_id = ?`;

  const assignees = await db.query(assigneesSql, [ticketId]);
  const attachments = await db.query(attachmentsSql, [ticketId]);

  return {
    ...result[0],
    assignees,
    attachments
  };
};

// สร้าง ticket ใหม่
// exports.createTicket = async ({
//   title,
//   description,
//   requester_name,
//   requester_phone,
//   line_user_id,
//   status = 'new'
// }) => {
//   const sql = `
//     INSERT INTO tickets 
//     (title, description, requester_name, requester_phone, line_user_id, status)
//     VALUES (?, ?, ?, ?, ?, ?)
//   `;

//   const result = await db.query(sql, [
//     title ?? '',
//     description ?? '',
//     requester_name ?? '',
//     requester_phone ?? '',
//     line_user_id ?? '',
//     status ?? 'new'
//   ]);

//   return { insertId: result.insertId };
// };

// รองรับแนบหลายไฟล์ (แบบปลอดภัย ไม่ใช้ VALUES ?)
exports.addAttachments = async (ticketId, files, uploaded_by = null) => {
  if (!files || files.length === 0) return;

  for (const file of files) {
    const sql = `
      INSERT INTO attachments 
      (ticket_id, file_name, file_path, mime_type, file_size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await db.query(sql, [
      ticketId,
      file.originalname,
      file.path,
      file.mimetype,
      file.size,
      uploaded_by
    ]);
  }
};

exports.assignTicket = async (ticketId, assigneeIds, updaterId) => {
  const [rows] = await db.query(`SELECT status FROM tickets WHERE ticket_id = ?`, [ticketId]);
  const ticket = rows[0];
  const oldStatus = ticket?.status;

  await db.query('DELETE FROM ticket_assignees WHERE ticket_id = ?', [ticketId]);

  if (Array.isArray(assigneeIds) && assigneeIds.length > 0) {
    const values = assigneeIds.map(id => [ticketId, id]);
    const placeholders = values.map(() => `(?, ?)`).join(', ');
    const flatValues = values.flat(); // แปลงเป็น array เดียว

    const sql = `INSERT INTO ticket_assignees (ticket_id, staff_id) VALUES ${placeholders}`;
    await db.query(sql, flatValues);

    if (oldStatus === 'new') {
      await db.query(`UPDATE tickets SET status = 'assigned' WHERE ticket_id = ?`, [ticketId]);
    }
  }
};

// อัปเดต title, description, status และ log การเปลี่ยนสถานะ
exports.updateTicket = async (ticketId, updateData, userId) => {
  const title = updateData.title ?? null;
  const description = updateData.description ?? null;
  const status = updateData.status ?? null;

  // ดึงสถานะเดิม
  const [rows] = await db.query(
    `SELECT status FROM tickets WHERE ticket_id = ?`,
    [ticketId]
  );
  const oldStatus = rows?.[0]?.status ?? null;

  // เตรียม query เฉพาะสำหรับอัปเดต closed_at และ resolved_at
  let extraFields = '';
  const extraParams = [];

  if (status && status !== oldStatus) {
    if (status === 'resolved') {
      extraFields += ', resolved_at = NOW()';
    } else if (status === 'closed') {
      extraFields += ', closed_at = NOW()';
    }
  }

  // UPDATE หลัก
  await db.query(
    `
    UPDATE tickets SET
      title = IFNULL(?, title),
      description = IFNULL(?, description),
      status = IFNULL(?, status)
      ${extraFields}
    WHERE ticket_id = ?
    `,
    [title, description, status, ...extraParams, ticketId]
  );

  // บันทึก log การเปลี่ยนสถานะ
  // if (status && oldStatus && status !== oldStatus) {
  //   await db.query(
  //     `INSERT INTO ticket_updates (ticket_id, user_id, old_status, new_status)
  //      VALUES (?, ?, ?, ?)`,
  //     [ticketId, userId, oldStatus, status]
  //   );
  // }
};

// ลบ ticket พร้อมข้อมูลที่เกี่ยวข้อง
exports.deleteTicket = async (ticketId) => {
  await db.query('DELETE FROM ticket_assignees WHERE ticket_id = ?', [ticketId]);
  await db.query('DELETE FROM attachments WHERE ticket_id = ?', [ticketId]);
  // await db.query('DELETE FROM ticket_updates WHERE ticket_id = ?', [ticketId]);
  return await db.query('DELETE FROM tickets WHERE ticket_id = ?', [ticketId]);
};

// ตรวจสอบว่า staff ถูก assign อยู่กับ ticket หรือไม่
exports.isStaffAssignedToTicket = async (ticketId, staffId) => {
  console.log('[DEBUG] isStaffAssignedToTicket called with:', { ticketId, staffId });

  if (!ticketId || !staffId) {
    console.warn('isStaffAssignedToTicket: ticketId หรือ staffId เป็น undefined/null', {
      ticketId,
      staffId
    });
    return false;
  }

  const sql = `
    SELECT COUNT(*) AS assigned_count 
    FROM ticket_assignees 
    WHERE ticket_id = ? AND staff_id = ?
  `;

  const [rows] = await db.query(sql, [Number(ticketId), Number(staffId)]);
  const resultRow = Array.isArray(rows) ? rows[0] : rows;
  const count = resultRow?.assigned_count;


  console.log('[DEBUG] Query raw rows:', rows);
  console.log('[DEBUG] assigned_count =', count);

  return Number(count) > 0;
};

// ดึงรายการ ticket ทั้งหมดของผู้ใช้จาก line_user_id
// exports.getTicketsByLineUserId = async (lineUserId) => {
//   const sql = `
//     SELECT ticket_id, title, status, created_at, updated_at
//     FROM tickets
//     WHERE line_user_id = ?
//     ORDER BY created_at DESC
//   `;
//   return await db.query(sql, [lineUserId]);
// };

// ดึงรายการ tickets ทั้งหมดของผู้ใช้จาก line_user_id (line)
exports.getTicketsByLineUserId = async (lineUserId) => {
  // ค้นหา ticket_id, title, และ status เรียงจากล่าสุดไปเก่าสุด
  const rows = await db.query(
    'SELECT ticket_id, title, status FROM tickets WHERE line_user_id = ? ORDER BY created_at DESC',
    [lineUserId]
  );
  return rows; // คืนค่าเป็น array ของ tickets
};

// สร้าง ticket ใหม่ลงในฐานข้อมูล (line)
exports.createTicket = async (ticket) => {
  // เพิ่มข้อมูล ticket ลงในตาราง tickets
  const result = await db.query(`
    INSERT INTO tickets (title, description, requester_name, requester_phone, line_user_id, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      ticket.title,           // หัวข้อของปัญหา
      ticket.description,     // รายละเอียดปัญหา
      ticket.requester_name,  // ชื่อผู้แจ้ง
      ticket.requester_phone, // เบอร์ผู้แจ้ง
      ticket.line_user_id,    // LINE user ID
      ticket.priority,        // ระดับความสำคัญ
      ticket.status           // สถานะเริ่มต้น (เช่น 'new')
  ]);

  // คืนค่า insertId ของ ticket ที่สร้างใหม่
  return { insertId: result.insertId };
};

// เพิ่มไฟล์แนบให้กับ ticket ที่ระบุ (line)
exports.addAttachments = async (ticketId, files, uploadedBy) => {
  // วนลูปเพิ่มไฟล์แนบทีละไฟล์
  for (const file of files) {
    await db.query(`
      INSERT INTO attachments (
        ticket_id, file_path, file_name, mime_type, file_size, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?)`, [
        ticketId,         // รหัสของ ticket ที่แนบไฟล์
        file.file_path,   // path ที่เก็บไฟล์
        file.file_name,   // ชื่อไฟล์
        file.mime_type,   // ชนิดของไฟล์
        file.file_size,   // ขนาดของไฟล์
        uploadedBy        // user_id ของผู้ที่อัปโหลด
    ]);
  }
};

// ดึงข้อมูลจำนวนงานที่พนักงานแต่ละคนรับผิดชอบ พร้อมเบอร์โทรศัพท์
// exports.getStaffWorkload = async () => {
//   const result = await db.query(`
//     SELECT 
//       u.user_id,
//       u.full_name,
//       u.phone,  -- เพิ่มตรงนี้
//       COUNT(ta.ticket_id) AS ticket_count
//     FROM users u
//     LEFT JOIN ticket_assignees ta ON u.user_id = ta.staff_id
//     WHERE u.role = 'staff'
//     GROUP BY u.user_id, u.full_name, u.phone
//     ORDER BY ticket_count ASC;
//   `);

//   // ดึง rows ให้รองรับทั้งกรณีเป็น [rows] หรือ [[rows], fields]
//   const rows = Array.isArray(result)
//     ? (Array.isArray(result[0]) ? result[0] : result)
//     : [result];

//   // console.log("✅ fixed rows:", rows);  // ใช้ตรวจสอบว่า rows เป็น array

//   // คืนข้อมูลแต่ละแถว พร้อม fallback ถ้า ticket_count เป็น null
//   return rows.map(row => ({
//     ...row,
//     ticket_count: row.ticket_count ?? 0,
//   }));
// };