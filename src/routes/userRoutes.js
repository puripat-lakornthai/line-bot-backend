// server/src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');

router.get('/staff', verifyToken, authorizeRoles('admin', 'staff'), userController.getAllStaff);
router.get('/', verifyToken, authorizeRoles('admin'), userController.getAllUsers);
router.get('/:id', verifyToken, authorizeRoles('admin'), userController.getUserById);
router.post('/', verifyToken, authorizeRoles('admin'), userController.createUserByAdmin);
router.put('/:id', verifyToken, authorizeRoles('admin'), userController.updateUserByAdmin);
router.delete('/:id', verifyToken, authorizeRoles('admin'), userController.deleteUserByAdmin);

module.exports = router;
