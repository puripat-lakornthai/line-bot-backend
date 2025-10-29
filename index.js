// index.js
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
// const { cleanOldTempFiles } = require('./line/services/mediaService');

const app = express();

// โหลด env (ถ้ามีไฟล์ .env ก็อ่าน; ถ้าไม่มีใช้ ENV จากระบบ)
dotenv.config();

// โหลด routes
const authRoutes = require('./src/routes/authRoutes');
const ticketRoutes = require('./src/routes/ticketRoutes');
const lineRoutes = require('./src/line/routes/lineRoutes');
const userRoutes = require('./src/routes/userRoutes');
const statsRoutes = require('./src/routes/statsRoutes');
const reportRoutes = require('./src/routes/reportRoutes');

// ตั้งค่า origin ที่อนุญาต
const allowedOrigins = [
  process.env.CLIENT_URL, // ใช้จาก .env
  'http://localhost:3000',
  // 'http://localhost:5000',
  /^https:\/\/[a-z0-9\-]+\.ngrok-free\.app$/, // รองรับ ngrok และลองใช้ให้ติดต่อกับ frontend แล้ว ngrok พังเพราะมันมีปัญหาอะไรสักอย่างกับ CORS
  /^https:\/\/.*\.trycloudflare\.com$/, // รองรับ cloudflare tunnel
  /^https:\/\/[a-z0-9\-]+\.loca\.lt$/, // รองรับ localtunnel
  'https://puripat.online',
  /^https:\/\/.*\.netlify\.app$/,  // รองรับ netlify
];

// CORS whitelist + credentials
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const ok = allowedOrigins.some(o =>
      o instanceof RegExp ? o.test(origin) : o === origin
    );
    if (ok) return callback(null, origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));

// ตรวจสอบ path webhook ก่อนใช้
const lineWebhookPath = process.env.LINE_WEBHOOK_PATH || '/webhook';
if (!lineWebhookPath.startsWith('/')) {
  throw new Error(`LINE_WEBHOOK_PATH ต้องขึ้นต้นด้วย / เช่น "/webhook" แต่ได้ "${lineWebhookPath}"`);
}
console.log(`LINE webhook listening at: /api/line${lineWebhookPath}`);

// // (ไม่ใช้ express.raw() ที่ index แล้วไปใช้ใน lineroute แทน)
// app.post(`/api/line${lineWebhookPath}`, express.raw({
//   type: 'application/json',
//   verify: (req, res, buf) => {
//     req.rawBody = buf.toString();
//   }
// }));

// mount LINE routes มาก่อน body parsers รวม
app.use('/api/line', lineRoutes);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static uploads (ตำแหน่งจริงอยู่ใน src/line/uploads)
app.use('/uploads', express.static(path.join(__dirname, 'src/line/uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
// app.use('/api/line', lineRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// require() มัน เป็นคำสั่งที่โหลดไฟล์ได้ทุกที่ ตอนแรกใช้ import แล้วมันพังตอน verify ใน line
// 🧹 ล้างไฟล์ temp อัตโนมัติ "ทุกๆ 1 นาที"
// และจะลบไฟล์ที่ "อายุมากกว่า 1 นาที"
setInterval(() => {
  console.log(`🧹 ล้างไฟล์ temp (${new Date().toLocaleString('th-TH')})`);
  try {
    const { cleanOldTempFiles } = require('./src/line/services/mediaService');
    cleanOldTempFiles(5); // ← สำคัญ: หน่วยเป็น "นาที" (เดิม 60 = 60 นาที)
  } catch (err) {
    console.error('❌ ล้างไฟล์ temp ล้มเหลว:', err.message);
  }
}, 1000 * 60 * 2); // เรียกทุก 1 นาที

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
});