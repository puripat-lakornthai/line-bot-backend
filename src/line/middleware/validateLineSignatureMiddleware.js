// server/src/line/middleware/validateLineSignatureMiddleware.js

const line = require('@line/bot-sdk');
const { lineMessagingApiConfig } = require('../config/lineConfig');

// Middleware สำหรับตรวจสอบ LINE Signature
module.exports = (req, res, next) => {
  const signature = req.headers['x-line-signature']; // ลายเซ็นจาก LINE

  // ต้องมี signature, rawBody, channelSecret 
  if (!signature || !req.rawBody || !lineMessagingApiConfig.channelSecret) {
    return res.status(400).send('Missing signature or rawBody');
  }

  // เทียบ HMAC(rawBody, secret) กับ signature ย่อมาจาก Hash-based Message Authentication Code คือก็สร้างลายเซ็นเพื่อยืนยันว่าข้อมูลไม่ได้ถูกแก้ไขมาก่อนกับ key เข้ารหัส กันลืม
  const isValid = line.validateSignature(
    req.rawBody,
    lineMessagingApiConfig.channelSecret,
    signature
  );

  if (!isValid) return res.status(401).send('Invalid signature');

  next();
};