// server/src/line/routes/lineRoutes.js

const express = require('express');
const router = express.Router();
const dotenv = require('dotenv');
dotenv.config();

// Controller ที่เกี่ยวกับ webhook จาก LINE
const { lineWebhookHandler } = require('../controller/lineWebhookController');

// ตรวจลายเซ็นจาก
const validateLineSignatureMiddleware = require('../middleware/validateLineSignatureMiddleware');

// Controller สำหรับแจ้งเตือน LINE (ฝั่ง admin ลบ ticket)
// const { notifyTicketDeleted } = require('../controller/lineNotifyController>');

// เส้นทางสำหรับ webhook LINE
const LINE_WEBHOOK_PATH = process.env.LINE_WEBHOOK_PATH || '/webhook';

// middleware สำหรับ log header
// const headerLogger = (req, res, next) => {
//   console.log(req.headers);                 // ทั้งหมด
//   console.log(req.get('x-line-signature')); // เฉพาะ signature
//   next();
// };

router.post(
  LINE_WEBHOOK_PATH,
  // 1 เก็บ raw body (Buffer) + ให้ req.body เป็น JSON
  express.json({
    verify: (req, res, buf) => { req.rawBody = buf; }
  }),
  // (เพิ่ม) log header ภายใน request context
  // headerLogger,
  // 2 ตรวจลายเซ็นจาก raw body
  validateLineSignatureMiddleware,
  // 3 ไป handler (ได้ req.body เป็น object แล้ว)
  lineWebhookHandler
);

// เส้นทางใหม่สำหรับแจ้งเตือนผู้ใช้เมื่อ ticket ถูกลบ
// router.post('/notify-delete', notifyTicketDeleted);

module.exports = router;
