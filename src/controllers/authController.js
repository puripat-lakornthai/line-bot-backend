const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

exports.login = async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุอีเมลหรือชื่อผู้ใช้ และรหัสผ่าน' });
  }

  try {
    console.log('>> identifier ที่รับมา:', identifier);

    let user = await userModel.findUserByEmail(identifier);
    if (!user) user = await userModel.findUserByUsername(identifier);

    console.log('>> user ที่พบ:', user);

    if (!user || !user.password_hash) {
      return res.status(401).json({ success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    console.log('>> password match:', isMatch);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const payload = {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    };

    const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
    const secret = process.env.JWT_SECRET || 'kai-secret';

    const token = jwt.sign(payload, secret, { expiresIn });

    const decoded = jwt.decode(token);
    const expDate = new Date(decoded.exp * 1000).toLocaleString();

    console.log('>> JWT Payload:', payload);
    console.log('>> JWT_EXPIRES_IN:', expiresIn);
    console.log('>> Token:', token);
    console.log('>> Token หมดอายุเวลา:', expDate);

    // ส่ง token ตรงให้ frontend ใช้
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: payload
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดระหว่างการเข้าสู่ระบบ' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await userModel.findUserById(req.user.user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password_hash, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    console.error('getMe error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.logout = (req, res) => {
  try {
    // ไม่มี cookie ให้ clear เพราะเราใช้ localStorage
    res.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดระหว่างการออกจากระบบ' });
  }
};
