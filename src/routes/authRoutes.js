const express = require('express');
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');
const router = express.Router();

router.post('/login', authController.login);
router.post('/logout', authController.logout);

router.get('/me', verifyToken, authController.getMe);

module.exports = router;
