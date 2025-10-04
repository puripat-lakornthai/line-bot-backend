const statsModel = require('../models/statsModel');

exports.getStaffWorkload = async (req, res) => {
  try {
    const result = await statsModel.getStaffWorkload();
    // console.log("result from model:", result);

    // res.status(200).json({ success: true, data: result });  // แบบมาตรฐานทั่วไป

    res.status(200).json(result); //  ส่งข้อมูล array ตรง ๆ ให้ frontend ใช้ response.data ได้เลย
  } catch (err) {
    console.error('Error fetching staff ticket counts:', err);
    res.status(500).json({ success: false, error: 'ไม่สามารถโหลดข้อมูลได้' });
  }
};

// ดึงรายการ ticket ของพนักงานแต่ละคน
exports.getTasksByStaffId = async (req, res) => {
  try {
    const staffId = req.params.id;
    const tasks = await statsModel.getTicketsByAssignee(staffId);
    res.status(200).json(tasks); // ส่ง array ตรง ๆ เช่น ({ success: true, data: tasks });
  } catch (err) {
    console.error('Error fetching tasks for staff:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดรายการงานของพนักงานได้' });
  }
};