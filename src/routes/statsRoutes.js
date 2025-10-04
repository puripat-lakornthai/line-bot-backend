const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

// ดึงจำนวนงาน ticket ที่พนักงานแต่ละคนรับผิดชอบ
router.get('/staff-workload', statsController.getStaffWorkload);

// ดึงรายการ ticket ของพนักงานแต่ละคน ตาม user_id (assignee_id)
router.get('/:id/tasks', statsController.getTasksByStaffId);

module.exports = router;
