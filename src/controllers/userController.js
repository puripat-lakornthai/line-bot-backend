const userModel = require('../models/userModel');
const bcrypt    = require('bcryptjs');

/* ───────────────────────────────  READ ALL  ───────────────────────────── */

exports.getAllUsers = async (req, res) => {
  try {
    const users = await userModel.getAllUsers(); // ไม่มี limit / offset แล้ว
    res.json({
      users,
      total: users.length,
    });
  } catch (err) {
    console.error('getAllUsers error:', err);
    res.status(500).json({
      message: 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้',
      users: [],
      total: 0,
    });
  }
};

// exports.getAllUsers = async (req, res) => {
//   try {
//     const page  = Math.max(parseInt(req.query.page)  || 1, 1);
//     const limit = Math.min(parseInt(req.query.limit) || 100, 100);
//     const offset = (page - 1) * limit;

//     /* model อาจคืน { users, total } หรือ { rows, count } */
//     const data            = await userModel.getAllUsersWithPagination(limit, offset);
//     const users           = data.users ?? data.rows  ?? [];
//     const totalRecords    = data.total ?? data.count ?? users.length;
//     const totalPages      = Math.max(1, Math.ceil(totalRecords / limit));

//     res.json({
//       users,
//       total: totalRecords,
//       totalPages,
//       currentPage: page,
//     });
//   } catch (err) {
//     console.error('getAllUsers error:', err);
//     res.status(500).json({
//       message: 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้',
//       users: [],
//       total: 0,
//       totalPages: 1,
//       currentPage: 1,
//     });
//   }
// };

/* ───────────────────────────────  READ ONE  ───────────────────────────── */
exports.getUserById = async (req, res) => {
  try {
    const user = await userModel.getUserById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    console.error('getUserById error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───────────────────────────────  CREATE (admin)  ─────────────────────── */
exports.createUserByAdmin = async (req, res) => {
  try {
    const { username, email, password, full_name, role, phone, line_user_id } = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกข้อมูลให้ครบถ้วน: username, email, password, role',
      });
    }

    if (await userModel.findUserByEmail(email)) {
      return res.status(400).json({ success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }
    if (await userModel.findUserByUsername(username)) {
      return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await userModel.createUserByAdmin(
      username,
      email,
      hashedPassword,
      full_name || null,
      role,
      phone || null,
      line_user_id || null
    );

    res.json({ success: true, user_id: result.insertId });
  } catch (err) {
    console.error('createUserByAdmin error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───────────────────────────────  UPDATE (admin)  ─────────────────────── */
exports.updateUserByAdmin = async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, email, password, full_name, role, phone, line_user_id } = req.body;
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const result = await userModel.updateUserByAdmin(userId, {
      username,
      email,
      hashedPassword,
      full_name,
      role,
      phone,
      line_user_id,
    });

    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error('updateUserByAdmin error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───────────────────────────────  DELETE (admin)  ─────────────────────── */
exports.deleteUserByAdmin = async (req, res) => {
  try {
    const result = await userModel.deleteUserByAdmin(req.params.id);
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error('deleteUserByAdmin error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───────────────────────────────  STAFF LIST  ─────────────────────────── */
exports.getAllStaff = async (req, res) => {
  try {
    const rows = await userModel.getStaff();
    res.json(rows);
  } catch (err) {
    console.error('getAllStaff error:', err);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูล staff ได้' });
  }
};
