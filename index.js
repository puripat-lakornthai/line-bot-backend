// /index.js
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
// const { cleanOldTempFiles } = require('./src/line/services/mediaService');

const app = express();

// โหลด env (ถ้ามีไฟล์ .env ก็อ่าน, ถ้าไม่มีจะใช้ env จากระบบ)
dotenv.config();

// โหลด routes (index.js อยู่นอกราก src => ต้องมี ./src/ นำหน้า)
const authRoutes   = require('./src/routes/authRoutes');
const ticketRoutes = require('./src/routes/ticketRoutes');
const lineRoutes   = require('./src/line/routes/lineRoutes');
const userRoutes   = require('./src/routes/userRoutes');
const statsRoutes  = require('./src/routes/statsRoutes');
const reportRoutes = require('./src/routes/reportRoutes');

// ตั้งค่า origin ที่อนุญาต
const allowedOrigins = [
  process.env.CLIENT_URL,
  /^https:\/\/[a-z0-9\-]+\.ngrok-free\.app$/,
  /^https:\/\/.*\.trycloudflare\.com$/,
  /^https:\/\/[a-z0-9\-]+\.loca\.lt$/,
  'https://puripat.online',
];

// CORS whitelist + credentials
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = allowedOrigins.some(o => o instanceof RegExp ? o.test(origin) : o === origin);
    return ok ? cb(null, origin) : cb(new Error('Not allowed by CORS'));
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

// LINE webhook ต้องใช้ raw body (ประกาศก่อน body-parser)
app.post(`/api/line${lineWebhookPath}`, express.raw({
  type: 'application/json',
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static uploads (อยู่ที่ src/line/uploads)
app.use('/uploads', express.static(path.join(__dirname, 'src/line/uploads')));

// API routes
app.use('/api/auth',   authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/line',    lineRoutes);
app.use('/api/users',   userRoutes);
app.use('/api/stats',   statsRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// ล้างไฟล์ temp ทุก 10 นาที (lazy load)
setInterval(() => {
  console.log(`🧹 ล้างไฟล์ temp (${new Date().toLocaleString('th-TH')})`);
  try {
    const { cleanOldTempFiles } = require('./src/line/services/mediaService');
    cleanOldTempFiles(60);
  } catch (err) {
    console.error('❌ ล้างไฟล์ temp ล้มเหลว:', err.message);
  }
}, 1000 * 60 * 10);

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
});

