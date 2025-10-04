// ลบเพราะไม่ใช้แล้วไปรวมกับ deleteTicket ใน ticketService แทน มัน clean กว่า
// server/src/line/controller/lineNotifyController.js

// const { pushDone } = require('../utils/lineClient');

// exports.notifyTicketDeleted = async (req, res) => {
//   const { line_user_id, ticket_title } = req.body;

//   if (!line_user_id || !ticket_title) {
//     return res.status(400).json({ message: 'Missing line_user_id or ticket_title' });
//   }

//   try {
//     await pushDone(line_user_id, `❌ งาน "${ticket_title}" ของคุณถูกลบแล้วโดยเจ้าหน้าที่`);
//     return res.status(200).json({ message: 'Notified successfully' });
//   } catch (err) {
//     console.error('[LINE Notify Error]', err.message);
//     return res.status(500).json({ message: 'Failed to notify user' });
//   }
// };
