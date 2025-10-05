// server/src/config/db.js
const mysql = require('mysql2/promise'); // ใช้ mysql2/promise เพื่อ async/await ที่ง่ายขึ้น
const path = require('node:path');
const fs = require('node:fs');

// โหลด .env.development เฉพาะตอนที่ไม่ใช่ production และ "ไม่ override" ค่า ENV จากแพลตฟอร์ม
const envPath = path.join(__dirname, '../../.env.development');
if (process.env.NODE_ENV !== 'production' && fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: false });
}

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'my_helpdesk_db',
  port: parseInt(process.env.DB_PORT || "3306", 10),
  waitForConnections: true,
  connectionLimit: 10, // จำนวน connection สูงสุดใน pool
  queueLimit: 0,       // ไม่จำกัดจำนวน request ที่รอ connection
  connectTimeout: 10000 // 10 วินาที
};

// สร้าง Connection Pool
const pool = mysql.createPool(dbConfig);

// ทดสอบการเชื่อมต่อ (Optional, แต่ดีสำหรับการตรวจสอบตอนเริ่ม Server)
async function testDbConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('✅🐬 Successfully connected to the MySQL database via pool.');
    const [rows] = await connection.query('SELECT VERSION() as version');
    console.log('🔬 MySQL Version:', rows[0].version);
  } catch (err) {
    console.error('❌ Failed to connect to the MySQL database:', err.message);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('Hint: Check your MySQL username and password in the .env file.');
    } else if (err.code === 'ER_DBACCESS_DENIED_ERROR') {
        console.error(`Hint: Ensure the user '${dbConfig.user}' has access to the database '${dbConfig.database}'.`);
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        console.error(`Hint: Check if the MySQL server is running at '${dbConfig.host}:${dbConfig.port}'.`);
    }
    // process.exit(1); // อาจจะต้องการให้ Server หยุดทำงานถ้าต่อ DB ไม่ได้
  } finally {
    if (connection) connection.release(); // คืน connection กลับสู่ pool เสมอ
  }
}

testDbConnection(); // เรียกใช้ตอนเริ่ม Server

module.exports = {
  // ฟังก์ชัน query ที่ปรับปรุงแล้วสำหรับ mysql2
  query: async (sql, params) => {
    const start = Date.now();
    let connection;
    try {
      connection = await pool.getConnection(); // ดึง connection จาก pool
      const [results, fields] = await connection.execute(sql, params); // ใช้ execute เพื่อป้องกัน SQL Injection กับ prepared statements
      const duration = Date.now() - start;
      if (process.env.NODE_ENV === 'development') {
        // MySQL `results` อาจจะมี property `affectedRows`, `insertId` ฯลฯ ขึ้นอยู่กับประเภท query
        // `results` โดยตรงคือ array ของ rows สำหรับ SELECT
        const rowCount = Array.isArray(results) ? results.length : (results.affectedRows || 0);
        // console.log('🔍 Executed query (MySQL):', { sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''), duration: `${duration}ms`, rows: rowCount });
      }
      return results; // คืนค่า results (สำหรับ SELECT คือ array ของ rows, สำหรับ INSERT/UPDATE/DELETE คือ object ข้อมูล)
    } catch (error) {
      // console.error('❌ MySQL Database query error:', { sql: sql.substring(0,100) + '...', params, message: error.message });
      throw error; // ส่ง error ต่อให้ controller จัดการ
    } finally {
      if (connection) connection.release(); // คืน connection กลับสู่ pool เสมอ
    }
  },
  pool // Export pool โดยตรงเผื่อต้องการใช้ transaction หรือ operation ที่ซับซ้อน
};