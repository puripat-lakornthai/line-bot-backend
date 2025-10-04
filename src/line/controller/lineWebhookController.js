// server/src/line/controller/lineWebhookController.js

const {
  handleTextMessage,
  handleImageMessage,
  handleFileMessage,
  handleVideoMessage
} = require('../services/lineMessageService');

const { lineMessagingApiConfig } = require('../config/lineConfig');
const line = require('@line/bot-sdk');

// Middleware สำหรับตรวจสอบ LINE Signature
exports.validateLineSignatureMiddleware = (req, res, next) => {
  const signature = req.headers['x-line-signature'];
  if (!signature || !req.rawBody || !lineMessagingApiConfig.channelSecret) {
    return res.status(400).send('Missing signature or rawBody');
  }

  const isValid = line.validateSignature(req.rawBody, lineMessagingApiConfig.channelSecret, signature);
  if (!isValid) return res.status(401).send('Invalid signature');
  next();
};

// Handler หลักสำหรับ webhook
exports.lineWebhookHandler = async (req, res) => {
  try {
    const body = JSON.parse(req.rawBody);
    console.log('✅ LINE Webhook Triggered');

    if (!Array.isArray(body.events)) return res.status(200).send('OK');

    // ประมวลผลแต่ละ event แบบ async โดยไม่ block การตอบกลับ
    for (const event of body.events) {
      if (event.type !== 'message') continue;

      const type = event.message.type;
      // ประมวลผลแบบ async แต่ไม่รอให้เสร็จก่อนตอบ LINE
      (async () => {
        try {
          if (type === 'text') {
            await handleTextMessage(event);
          } else if (type === 'image') {
            await handleImageMessage(event);
          } else if (type === 'file') {
            await handleFileMessage(event);
          } else if (type === 'video') {
            await handleVideoMessage(event);
          } else {
            console.warn(`⚠️ Unsupported message type: ${type}`);
          }
        } catch (err) {
          console.error('❌ Error in message handler:', err.message || err);
        }
      })();
    }

    // ตอบ LINE ทันที (แม้ message handler จะยังทำงานอยู่)
    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Error in webhook handler:', err);
    return res.status(500).send('Internal error');
  }
};
