const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// สรุป dashboard
router.get('/dashboard/summary', reportController.getDashboardSummary);

// โหลดรายงาน tickets
router.get('/tickets', reportController.downloadTicketReport);

module.exports = router;
