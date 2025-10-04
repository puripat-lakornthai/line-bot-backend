// server/src/middlewares/ticketMiddleware.js

const ticketModel = require('../models/ticketModel');

// ตรวจสอบว่า ticket มีอยู่จริง และถ้าเป็น staff จะต้องได้รับมอบหมาย ticket นั้นก่อน ถึงจะเข้าถึงได้
exports.verifyTicketAccess = async (req, res, next) => {
  try {
    const ticketId = req.params.id;
    const user = req.user;

    // Debug
    console.log('▶️ Ticket ID:', ticketId);
    console.log('▶️ User from token:', user);

    if (!ticketId || isNaN(ticketId)) {
      return res.status(400).json({ message: 'Ticket ID ไม่ถูกต้อง' });
    }

    // ดึงข้อมูล ticket เพื่อเช็คการมีอยู่
    const ticket = await ticketModel.getTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'ไม่พบ Ticket' });
    }

    // แนบ ticket ไว้ที่ req เพื่อใช้ต่อใน controller
    req.ticket = ticket;

    // ถ้าเป็น staff ให้ตรวจสอบว่าได้รับมอบหมายหรือไม่
    if (user.role === 'staff') {
      const staffId = user.user_id || user.id;
      const isAssigned = await ticketModel.isStaffAssignedToTicket(ticketId, staffId);

      console.log(`🔒 Staff ${staffId} assigned to ticket ${ticketId}?`, isAssigned);

      if (!isAssigned) {
        return res.status(403).json({ message: 'คุณไม่ได้รับมอบหมาย Ticket นี้' });
      }
    }

    next();
  } catch (error) {
    console.error('verifyTicketAccess Middleware Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์' });
  }
};

// จำกัดสิทธิ์ staff แก้ไขเฉพาะ status เท่านั้น
exports.onlyUpdateStatus = (req, res, next) => {
  const user = req.user;
  const update = req.body;

  if (user.role === 'staff') {
    const blocked = ['title', 'description', 'assignee_id'];
    const found = blocked.some(key => key in update);

    if (found) {
      return res.status(403).json({ message: 'Staff สามารถอัปเดตได้เฉพาะสถานะเท่านั้น' });
    }
  }

  next();
};
