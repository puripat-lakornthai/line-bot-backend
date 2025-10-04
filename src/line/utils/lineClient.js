// server/src/line/utils/lineClient.js

const line = require('@line/bot-sdk');
const { lineMessagingApiConfig } = require('../config/lineConfig');

// สร้าง LINE Messaging API client โดยใช้ access token จาก config
const messagingClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineMessagingApiConfig.channelAccessToken,
});

// ฟังก์ชันสำหรับตอบกลับข้อความผ่าน LINE Messaging API หรือตอบกลับข้อความแบบทันที
exports.reply = async (token, text) => {
  try {
    // เรียก API เพื่อส่งข้อความตอบกลับผู้ใช้
    return await messagingClient.replyMessage({
      replyToken: token,              // token ที่ได้จาก webhook event
      messages: [{ type: 'text', text }] // ส่งข้อความประเภท text กลับไปยังผู้ใช้
    });
  } catch (err) {
    // แสดง error ในกรณีที่ส่งข้อความไม่สำเร็จ
    console.error('reply error:', err.message);
  }
};

// ฟังก์ชัน push ข้อความ ส่งข้อความแบบ push หลังจาก event จบไปแล้ว เช่นหลังจากอัปโหลดเสร็จ
exports.pushDone = async (userId, text) => {
  try {
    await messagingClient.pushMessage({
      to: userId,
      messages: [{ type: 'text', text }],
    });
  } catch (err) {
    console.error('[pushDone error]', err.message);
  }
};