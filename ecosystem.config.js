// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'helpdesk-server',
      script: 'server.js',          // ← ใช้ไฟล์ที่ root ที่เราเพิ่งสร้าง
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3001,
      },
      time: true,                   // pm2 logs มี timestamp
    },
  ],
};
