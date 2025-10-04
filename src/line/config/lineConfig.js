// server/src/config/lineConfig.js
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// โหลดค่าคอนฟิกของ LINE Messaging API จากไฟล์ .env
const lineMessagingApiConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN, // Token สำหรับใช้เรียก Messaging API
  channelSecret: process.env.LINE_CHANNEL_SECRET,           // Secret สำหรับตรวจสอบ LINE signature
};

// โหลดค่าคอนฟิกของ LINE Notify จากไฟล์ .env
const lineNotifyConfig = {
  accessToken: process.env.LINE_NOTIFY_ACCESS_TOKEN, // Token สำหรับใช้ส่งข้อความผ่าน LINE Notify
};

// ตรวจสอบว่าค่าคอนฟิกของ Messaging API ถูกต้องหรือไม่
if (process.env.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_SECRET) {
  if (!lineMessagingApiConfig.channelAccessToken || !lineMessagingApiConfig.channelSecret) {
    console.warn('⚠️ LINE Messaging API configuration is incomplete. Webhook functionality may be affected.');
  }
}

// ตรวจสอบว่า LINE Notify มี access token หรือไม่
if (process.env.LINE_NOTIFY_ACCESS_TOKEN) {
  if (!lineNotifyConfig.accessToken) {
    console.warn('⚠️ LINE Notify Access Token is missing. Notification service may be affected.');
  }
}

// ส่งออกคอนฟิกให้ส่วนอื่นใช้งานได้
module.exports = {
  lineMessagingApiConfig,
  lineNotifyConfig,
};
