const jwt = require('jsonwebtoken');

// เรียกใช้ JWT_SECRET จาก .env ถ้าไม่มีใช้ค่าเริ่มต้น 'jwt_secret'
const JWT_SECRET = process.env.JWT_SECRET || ''; 

exports.verifyToken = (req, res, next) => {
  // ตรวจสอบ header ที่ส่งมาทั้งพิมพ์เล็กและพิมพ์ใหญ่
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    // แยก token ออกมา
    const token = authHeader.split(' ')[1];
    console.log('Received token:', token);  // ตรวจสอบ token ที่ได้รับ
    
    try {
      // ตรวจสอบความถูกต้องของ token
      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
          console.log('Token verification failed:', err.message);  // แสดงข้อผิดพลาดถ้ามี
          return res.status(401).json({ message: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' });
        }
        
        // เก็บข้อมูลผู้ใช้ที่ตรวจสอบแล้วไว้ใน req.user
        req.user = decoded;
        next(); // ให้ไปยัง middleware ถัดไป
      });
    } catch (error) {
      console.log('Error in token verification:', error.message);  // ตรวจสอบข้อผิดพลาดจาก jwt.verify()
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการตรวจสอบโทเค็น' });
    }

  } else {
    // ถ้าไม่มี token ส่งมา
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบและใส่โทเค็น' });
  }
};

// authorizeRoles
exports.authorizeRoles = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user.role.toLowerCase(); // ปรับ role เป็นตัวพิมพ์เล็ก
    console.log('User Role:', userRole);
    console.log('Authorized Roles:', roles);
    const normalizedRoles = roles.map(role => role.toLowerCase()); // แปลง roles เป็นตัวพิมพ์เล็กทั้งหมด
    if (!normalizedRoles.includes(userRole)) {
      console.log('Unauthorized role access:', req.user.role);
      return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });
    }
    next();
  };
};
