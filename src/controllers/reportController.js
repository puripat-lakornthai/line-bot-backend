const reportModel = require('../models/reportModel');
const userModel = require('../models/userModel');
const ExcelJS = require('exceljs')

// ดึงข้อมูลสรุปเพื่อนำไปแสดงใน Dashboard
exports.getDashboardSummary = async (req, res) => {
  try {
    // ดึงข้อมูลจำนวน ticket แต่ละสถานะ เช่น new, assigned ฯลฯ
    const raw = await reportModel.getTicketSummary();

    // ดึงจำนวนผู้ใช้ทั้งหมด
    const total_users = await userModel.getTotalUsers();

    // เตรียม object สำหรับเก็บข้อมูลสรุป
    const summary = {
      total_tickets: 0,
      new_tickets: 0,
      assigned_tickets: 0,
      pending_tickets: 0,
      in_progress_tickets: 0,
      resolved_tickets: 0,
      closed_tickets: 0,
      total_users,
    };

    // วนลูปข้อมูลที่ได้จาก getTicketSummary เพื่อรวมค่า
    raw.forEach(({ status, count }) => {
      summary.total_tickets += count;
      const key = `${status}_tickets`; // เช่น 'new_tickets'
      if (key in summary) summary[key] = count;
    });

    // ส่งผลลัพธ์ summary กลับไปเป็น JSON
    res.json(summary);
  } catch (err) {
    console.error('Dashboard summary error:', err.message);
    res.status(500).json({ message: 'ดึงข้อมูลสรุปล้มเหลว' });
  }
};

exports.downloadTicketReport = async (req, res) => {
  try {
    const tickets = await reportModel.getAllTickets();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Tickets');

    // ตั้งค่าหัวตารางภาษาไทย
    worksheet.columns = [
      { header: 'รหัส Ticket', key: 'ticket_id', width: 10 },
      { header: 'หัวข้อ', key: 'title', width: 30 },
      { header: 'สถานะ', key: 'status', width: 15 },
      { header: 'วันที่สร้าง', key: 'created_at', width: 20 },
      { header: 'วันที่อัปเดต', key: 'updated_at', width: 20 },
    ];

    // แผนที่สถานะจากอังกฤษ เป็นไทย
    const translateStatus = (status) => {
      const map = {
        new: 'ใหม่',
        assigned: 'มอบหมายแล้ว',
        pending: 'รอดำเนินการ',
        in_progress: 'กำลังดำเนินการ',
        resolved: 'แก้ไขแล้ว',
        closed: 'ปิดแล้ว',
      };
      return map[status] || status;
    };

    // เติมข้อมูลพร้อมแปลสถานะ
    tickets.forEach(ticket => {
      worksheet.addRow({
        ...ticket,
        status: translateStatus(ticket.status),
      });
    });

    // ตั้งค่า header สำหรับดาวน์โหลด
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=tickets_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Download report error:', err.message);
    res.status(500).json({ success: false, message: 'โหลดรายงานล้มเหลว' });
  }
};
