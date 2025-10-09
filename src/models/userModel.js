const db = require('../config/db');

// ค้นหา user จาก email
exports.findUserByEmail = async (email) => {
  try {
    const sql = 'SELECT * FROM users WHERE email = ?';
    const result = await db.query(sql, [email]);
    console.log('>> DB: findUserByEmail result:', result);
    return result.length > 0 ? result[0] : null;
  } catch (err) {
    console.error('DB error in findUserByEmail:', err);
    throw err;
  }
};

// ค้นหา user จาก username
exports.findUserByUsername = async (username) => {
  try {
    const sql = 'SELECT * FROM users WHERE username = ?';
    const result = await db.query(sql, [username]);
    console.log('>> DB: findUserByUsername result:', result);
    return result.length > 0 ? result[0] : null;
  } catch (err) {
    console.error('DB error in findUserByUsername:', err);
    throw err;
  }
};

// ค้นหา user จาก user_id
exports.findUserById = async (id) => {
  try {
    const sql = 'SELECT * FROM users WHERE user_id = ?';
    const result = await db.query(sql, [id]);
    return result.length > 0 ? result[0] : null;
  } catch (err) {
    console.error('DB error in findUserById:', err);
    throw err;
  }
};

// ดึง user ทั้งหมด (ไม่มี pagination)
exports.getAllUsers = async () => {
  try {
    // เพิ่ม full_name, phone, line_user_id, created_at, updated_at
    const sql = `
      SELECT
        user_id,
        username,
        full_name,
        email,
        role,
        phone,
        line_user_id,
        created_at,
        updated_at
      FROM users
    `;
    const result = await db.query(sql);
    // console.log('>> DB: getAllUsers result:', result);
    return result;
  } catch (err) {
    console.error('DB error in getAllUsers:', err);
    throw err;
  }
};

// exports.getAllUsersWithPagination = async (limit = 1, offset = 0) => {
//   const sql = `
//     SELECT
//       user_id,
//       username,
//       full_name,
//       email,
//       role,
//       phone,
//       line_user_id,
//       created_at,
//       updated_at
//     FROM users
//     ORDER BY updated_at DESC
//     LIMIT ? OFFSET ?
//   `;
//   const countSql = `SELECT COUNT(*) AS total FROM users`;

//   const users = await db.query(sql, [limit, offset]);
//   const count = await db.query(countSql);

//   return {
//     users,
//     total: count[0]?.total || 0
//   };
// };

// เพิ่ม user ใหม่โดย admin
exports.createUserByAdmin = async (username, email, hashedPassword, full_name, role, phone, line_user_id) => {
  try {
    const sql = `
      INSERT INTO users (username, email, password_hash, full_name, role, phone, line_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    // ✅ ใช้ null แทน undefined
    const values = [
      username,
      email,
      hashedPassword,
      full_name ?? null,
      role,
      phone ?? null,
      line_user_id ?? null
    ];

    const result = await db.query(sql, values);
    console.log('>> DB: createUserByAdmin result:', result);
    return result;
  } catch (err) {
    console.error('DB error in createUserByAdmin:', err);
    throw err;
  }
};

// อัปเดตข้อมูล user โดย admin
exports.updateUserByAdmin = async (id, data) => {
  try {
    const fields = [];
    const values = [];

    if (data.username) {
      fields.push('username = ?');
      values.push(data.username);
    }
    if (data.email) {
      fields.push('email = ?');
      values.push(data.email);
    }
    if (data.hashedPassword) {
      fields.push('password_hash = ?');
      values.push(data.hashedPassword);
    }
    if (data.full_name) {
      fields.push('full_name = ?');
      values.push(data.full_name);
    }
    if (data.role) {
      fields.push('role = ?');
      values.push(data.role);
    }
    if (data.phone) {
      fields.push('phone = ?');
      values.push(data.phone);
    }
    if (data.line_user_id) {
      fields.push('line_user_id = ?');
      values.push(data.line_user_id);
    }

    if (fields.length === 0) return { affectedRows: 0 };

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`;
    values.push(id);

    const result = await db.query(sql, values);
    console.log('>> DB: updateUserByAdmin result:', result);
    return result;
  } catch (err) {
    console.error('DB error in updateUserByAdmin:', err);
    throw err;
  }
};

// ลบ user โดย admin
exports.deleteUserByAdmin = async (id) => {
  try {
    const sql = 'DELETE FROM users WHERE user_id = ?';
    const result = await db.query(sql, [id]);
    console.log('>> DB: deleteUserByAdmin result:', result);
    return result;
  } catch (err) {
    console.error('DB error in deleteUserByAdmin:', err);
    throw err;
  }
};

// ฟังก์ชันสำหรับค้นหาผู้ใช้จาก line_user_id หากไม่มีให้สร้างใหม่ (line)
exports.findOrCreateByLineId = async (lineUserId, fullName = null) => {
  // ค้นหา user_id จากตาราง users โดยใช้ line_user_id
  const result = await db.query('SELECT user_id FROM users WHERE line_user_id = ?', [lineUserId]);

  // ถ้าพบข้อมูลผู้ใช้ ให้คืนค่า user_id ที่เจอ
  if (result.length > 0) return result[0].user_id;

  // ถ้าไม่พบ ให้เพิ่มผู้ใช้ใหม่โดยใช้ fullName (หรือ 'unknown' ถ้าไม่มี)
  const insert = await db.query(
    'INSERT INTO users (role, line_user_id) VALUES (?, ?)',
    ['requester', lineUserId]
  );

  // คืนค่า user_id ที่เพิ่มใหม่ (line)
  return insert.insertId;
};

exports.getStaff = async () => {
  try {
    const sql = `
      SELECT user_id, full_name
      FROM users
      WHERE role = 'staff'
    `;
    const result = await db.query(sql);
    return result;
  } catch (err) {
    console.error('DB error in getStaff:', err);
    throw err;
  }
};

// ดึงจำนวนผู้ใช้งานทั่วไป (เฉพาะ role = 'requester')
exports.getTotalUsers = async () => {
  const sql = `SELECT COUNT(*) AS total FROM users WHERE role = 'requester'`;
  const rows = await db.query(sql); // ตรงนี้ db.query() คืน rows ไปเลย ไม่ต้อง destructure

  const total = parseInt(rows?.[0]?.total ?? 0, 10);
  console.log(`[DB] TOTAL users with role=requester = ${total}`);

  return total;
};