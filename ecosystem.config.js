// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'helpdesk-server',
      script: 'src/index.js',      // ✅ แก้จาก server.js → src/index.js
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3001,
      },
      time: true,                   // ให้ pm2 logs มี timestamp
    },
  ],
};
