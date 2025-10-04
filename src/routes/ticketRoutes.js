// server/src/routes/ticketRoutes.js

const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { verifyTicketAccess, onlyUpdateStatus } = require('../middlewares/ticketMiddleware'); // ตรวจสอบสิทธิ์เข้าถึง Ticket ตาม user
const upload = require('../middlewares/uploadMiddleware'); // จัดการการอัปโหลดไฟล์

// Middleware นี้จะถูกใช้กับทุก Route ในไฟล์นี้
// `verifyToken` ควรถูกเขียนให้รองรับกรณีที่ไม่มี Token ได้สำหรับ Route ที่ไม่ต้องการ login (เช่น LINE webhook)
router.use(verifyToken);

// --- Routes หลักสำหรับจัดการ Ticket ---

// GET /api/tickets -> ดึงรายการ Ticket ทั้งหมด (สำหรับ Admin/Staff)
router.get('/', authorizeRoles('admin', 'staff'), ticketController.getAllTickets);

// GET /api/tickets/:id -> ดึงข้อมูล Ticket เดียว (สำหรับ Admin/Staff) พร้อมตรวจสอบสิทธิ์เข้าถึง
router.get('/:id', authorizeRoles('admin', 'staff'), verifyTicketAccess, ticketController.getTicketById);

// POST /api/tickets -> สร้าง Ticket ใหม่ (สำหรับ User ที่ Login และ Webhook จาก LINE)
router.post('/', upload.array('attachments', 5), ticketController.createTicket);

// PUT /api/tickets/:id -> อัปเดต Ticket (สำหรับ Admin/Staff) พร้อมตรวจสอบสิทธิ์และจำกัดสิทธิ์ staff
router.put(
  '/:id',
  authorizeRoles('admin', 'staff'),
  verifyTicketAccess,        // ตรวจสอบว่ามีสิทธิ์เข้าถึง ticket นี้
  onlyUpdateStatus,       // จำกัดไม่ให้ staff แก้ title, description, assignee
  upload.array('attachments', 5),
  ticketController.updateTicket
);

// DELETE /api/tickets/:id -> ลบ Ticket (สำหรับ Admin เท่านั้น) พร้อมตรวจสอบสิทธิ์เข้าถึง
router.delete('/:id', authorizeRoles('admin'), verifyTicketAccess, ticketController.deleteTicket);

// PUT /api/tickets/:id/assign -> มอบหมาย Ticket (Admin เท่านั้น)
router.put('/:id/assign', authorizeRoles('admin'), ticketController.assignTicket);

module.exports = router;