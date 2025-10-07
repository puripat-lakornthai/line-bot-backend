// server/src/line/middleware/validateLineSignatureMiddleware.js

const line = require('@line/bot-sdk');
const { lineMessagingApiConfig } = require('../config/lineConfig');

// Middleware สำหรับตรวจสอบ LINE Signature

module.exports = (req, res, next) => {
  const signature = req.headers['x-line-signature'];
  if (!signature || !req.rawBody || !lineMessagingApiConfig.channelSecret) {
    return res.status(400).send('Missing signature or rawBody');
  }

  const isValid = line.validateSignature(
    req.rawBody,
    lineMessagingApiConfig.channelSecret,
    signature
  );

  if (!isValid) return res.status(401).send('Invalid signature');

  next();
};