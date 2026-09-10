// routes/taskworkpartroutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const {
    createWorkPart,
    getWorkParts,
    updateWorkPartStatus,
    deleteWorkPart
} = require('../controllers/taskWorkPartController');

router.post('/tasks/:taskId/work-parts', authenticate, createWorkPart);
router.get('/tasks/:taskId/work-parts', authenticate, getWorkParts);
router.patch('/work-parts/:workPartId/status', authenticate, updateWorkPartStatus);
router.delete('/work-parts/:workPartId', authenticate, deleteWorkPart);

module.exports = router;
