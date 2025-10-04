// server/src/line/routes/lineRoutes.js

const express = require('express');
const router = express.Router();
const dotenv = require('dotenv');
dotenv.config();

// Controller ที่เกี่ยวกับ webhook จาก LINE
const {
  lineWebhookHandler,
  validateLineSignatureMiddleware
} = require('../controller/lineWebhookController');

// Controller สำหรับแจ้งเตือน LINE (ฝั่ง admin ลบ ticket)
const { notifyTicketDeleted } = require('../controller/lineNotifyController');

// เส้นทางสำหรับ webhook LINE
const LINE_WEBHOOK_PATH = process.env.LINE_WEBHOOK_PATH || '/webhook';
router.post(LINE_WEBHOOK_PATH, validateLineSignatureMiddleware, lineWebhookHandler);

// เส้นทางใหม่สำหรับแจ้งเตือนผู้ใช้เมื่อ ticket ถูกลบ
// router.post('/notify-delete', notifyTicketDeleted);

module.exports = router;
