// server/src/handlers/lineMessageService.js

// รวม handler ต่าง ๆ ที่ใช้จัดการข้อความและ media จากผู้ใช้ LINE
// ใช้ใน controller เพื่อ route ไปยังฟังก์ชันที่เหมาะสมตามประเภท message

// handler สำหรับข้อความประเภท text
const handleTextMessage = require('../handlers/handleTextMessage');

// handler สำหรับ media แต่ละประเภท: image, file, video
const {
  handleImageMessage,
  handleFileMessage,
  handleVideoMessage
} = require('../handlers/mediaHandler');

// export รวมทั้งหมดไว้ใน object เดียว เพื่อให้เรียกใช้งานได้ง่าย
module.exports = {
  handleTextMessage,
  handleImageMessage,
  handleFileMessage,
  handleVideoMessage,
};
