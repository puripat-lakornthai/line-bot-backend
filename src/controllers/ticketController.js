// server/src/controllers/ticketController.js

const ticketModel = require('../models/ticketModel');
const { pushDone } = require('../line/utils/lineClient');
const { deleteTicketFolder } = require('../line/services/mediaService');

exports.createTicket = async (req, res) => {
  try {
    const { title, description, line_user_id } = req.body;
    const requester_id = req.user?.id || null;
    const files = req.files || [];
    const result = await ticketModel.createTicket({ title, description, requester_id, line_user_id }, files);
    res.status(201).json({ message: 'สร้าง Ticket สำเร็จ', ticketId: result.ticketId });
  } catch (error) {
    console.error('Create Ticket Error:', error.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้าง Ticket' });
  }
};

// ดึง ticket ทั้งหมด โดยมี filter + pagination (คำนวณใน controller)
exports.getAllTickets = async (req, res) => {
  try {
    // ดึงค่า page จาก query string และบังคับให้ page >= 1
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = 2; // จำนวนรายการต่อหน้า
    const offset = (page - 1) * limit; // คำนวณ offset สำหรับ SQL

    // รับคำค้นหา (รองรับทั้ง search และ q)
    const keyword = (req.query.search ?? req.query.q ?? '').trim();

    // เตรียม filters สำหรับส่งเข้า model
    const filters = {
      offset,                 // เริ่มดึงจากแถวที่เท่าไร
      limit,                  // ดึงกี่รายการ
      status: req.query.status,          // กรองสถานะ
      assignee_id: req.query.assignee_id, // กรองผู้รับผิดชอบ
      sort_by: req.query.sort_by,         // เรียงตามคอลัมน์
      sort_order: req.query.sort_order,   // เรียงจากมากไปน้อย
      search: keyword || undefined,       // เพิ่มคำค้นหา (ใหม่)
    };

    // เรียก model เพื่อดึงข้อมูล
    const data = await ticketModel.getAllTicketsWithFilter(filters);

    // ส่งผลลัพธ์กลับ frontend
    res.status(200).json({
      tickets: data.tickets ?? [],                     // รายการ ticket
      totalPages: Math.ceil(data.total / limit),       // จำนวนหน้าทั้งหมด
      total: data.total,                               // จำนวนทั้งหมด
      currentPage: page,                               // หน้าปัจจุบัน
    });
  } catch (error) {
    console.error('Get All Tickets Controller Error:', error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการดึงรายการแจ้งปัญหา',
      tickets: [],
      totalPages: 1,
      currentPage: 1,
      total: 0
    });
  }
};

// ดึงข้อมูล Ticket รายการเดียว (เฉพาะรายการที่มีสิทธิ์เข้าถึง)
exports.getTicketById = async (req, res) => {
  try {
    const ticket = req.ticket; // ใช้ ticket ที่ดึงไว้แล้วจาก middleware เพื่อลดการเรียก DB ซ้ำ

    res.json(ticket);
  } catch (error) {
    console.error(`CONTROLLER ERROR for getTicketById (ID: ${req.params.id}):`, error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดร้ายแรงที่ Server' });
  }
};

// มอบหมาย staff ให้ Ticket (admin เท่านั้น)
exports.assignTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const userId = req.user?.id;

    const assigneeIds = req.body.assignee_ids || 
    (req.body.assignee_id ? [req.body.assignee_id] : []);

    console.log('📌 ticketId:', ticketId);
    console.log('📌 userId:', userId);
    console.log('📌 assigneeIds:', assigneeIds);

    if (!Array.isArray(assigneeIds)) {
      return res.status(400).json({ message: 'ข้อมูลผู้รับผิดชอบไม่ถูกต้อง' });
    }

    await ticketModel.assignTicket(ticketId, assigneeIds, userId);
    res.json({ message: 'มอบหมายงานสำเร็จ' });
  } catch (err) {
    console.error('Assign Ticket Error:', err); // error
    res.status(500).json({ message: 'ไม่สามารถมอบหมายงานได้' });
  }
};

// อัปเดต ticket และส่งแจ้งเตือน LINE เมื่อสถานะเปลี่ยน (รวม ticket_id, ชื่อเรื่อง, สถานะ)
exports.updateTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const updateData = req.body;
    const user = req.user;
    const ticket = req.ticket; // ใช้ ticket ที่เตรียมไว้จาก middleware เพื่อไม่เรียกซ้ำจาก model

    // ตรวจสอบว่า staff แก้ไขเฉพาะสถานะเท่านั้น
    // if (user.role === 'staff') {
    //   const restrictedFields = ['title', 'description', 'assignee_id'];
    //   const hasRestricted = restrictedFields.some(field => updateData.hasOwnProperty(field));
    //   if (hasRestricted) {
    //     return res.status(403).json({ message: 'Staff สามารถอัปเดตได้เฉพาะสถานะเท่านั้น' });
    //   }
    // }

    // แยก assignee_id ออก ไม่ส่งเข้า model
    const { assignee_id, ...restData } = updateData;
    const oldStatus = ticket.status;

    const result = await ticketModel.updateTicket(ticketId, restData, user.id);
    if (result?.error) {
      return res.status(500).json({ message: result.error });
    }

    // สถานะทั้งหมดพร้อม label และข้อความ
    const statusMap = {
      new: {
        label: 'ใหม่',
        message: 'งานถูกสร้างใหม่และยังไม่มีเจ้าหน้าที่รับผิดชอบ'
      },
      assigned: {
        label: 'มอบหมายแล้ว',
        message: 'งานถูกมอบหมายให้เจ้าหน้าที่ดูแลแล้ว'
      },
      pending: {
        label: 'รอข้อมูลเพิ่มเติม',
        message: 'งานอยู่ในสถานะรอข้อมูลเพิ่มเติม\n\nเจ้าหน้าที่ต้องการข้อมูลเพิ่มเติม กรุณาตอบกลับในแชท หากยังไม่ตอบ เจ้าหน้าที่จะติดต่อกลับภายหลัง'
      },
      in_progress: {
        label: 'กำลังดำเนินการ',
        message: 'งานกำลังอยู่ในระหว่างดำเนินการ'
      },
      resolved: {
        label: 'แก้ไขแล้ว',
        message: 'งานได้รับการแก้ไขเรียบร้อยแล้ว'
      },
      closed: {
        label: 'ปิดงาน',
        message: 'งานถูกปิดเรียบร้อยแล้ว ขอบคุณที่แจ้งปัญหาเข้ามา'
      }
    };

    // แจ้งเตือนผ่าน LINE เมื่อมีการเปลี่ยนสถานะ และมี line_user_id
    if (restData.status && restData.status !== oldStatus && ticket.line_user_id) {
      const oldLabel = statusMap[oldStatus]?.label || oldStatus;
      const newLabel = statusMap[restData.status]?.label || restData.status;
      const message = statusMap[restData.status]?.message || '';

      let msg = `📌 งาน #${ticket.ticket_id} "${ticket.title}" เปลี่ยนจาก "${oldLabel}" เป็น "${newLabel}"\n\nℹ️ ${message}`;

      if (restData.status === 'closed') {
        msg += `\n\n🙏 ขอบคุณที่แจ้งปัญหาเข้ามา หากมีปัญหาอื่นสามารถส่งเข้ามาใหม่ได้ตลอดเวลา`;
      }

      await pushDone(ticket.line_user_id, msg);
    }

    return res.status(200).json({ message: 'อัปเดต Ticket สำเร็จ' });
  } catch (error) {
    console.error('Update Ticket Error:', error.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดต Ticket' });
  }
};

// ลบ Ticket ตาม ID ที่รับมา พร้อมลบไฟล์แนบ และแจ้งเตือนผู้ใช้ผ่าน LINE หากมี line_user_id
exports.deleteTicket = async (req, res) => {
  const ticketId = req.params.id;
  try {
    const ticket = req.ticket; // ใช้ ticket ที่ดึงไว้แล้วจาก middleware เพื่อลดการเรียก DB ซ้ำ

    // ลบ DB และไฟล์แนบในระบบ
    await ticketModel.deleteTicket(ticketId);
    await deleteTicketFolder(ticketId);

    // แจ้งเตือนผู้ใช้ทาง LINE ถ้ามี line_user_id
    if (ticket.line_user_id) {
      await pushDone(
        ticket.line_user_id,
        `❌ งาน "${ticket.title}" (#${ticket.ticket_id}) ที่ส่งเมื่อ ${new Date(ticket.created_at).toLocaleString('th-TH')} ถูกลบโดยเจ้าหน้าที่`
      );
    }

    res.json({ message: 'ลบ Ticket สำเร็จ' });
  } catch (error) {
    console.error('Delete Ticket Error:', error.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบ Ticket' });
  }
};



