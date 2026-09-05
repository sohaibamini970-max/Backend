const express = require('express');
const router = express.Router();
const {
  addSubmisson,
  getSubmissions,
  getLatestSubmission,
  deleteSubmission,
  markTaskDone,
} =
require('../controllers/tasksubmissioncontroller');
const {authenticate} = require('../middleware/authMiddleware');

// Submission CRUD
router.post('/tasks/:taskId/submissions',authenticate, addSubmission);
router.get('/tasks/:taskId/submissions',authenticate, getSubmissions);
router.get('/tasks/:taskId/submissions/latest',authenticate,getLatestSubmission);
router.delete('/submissions/:submissionId',authenticate,deleteSubmission);

// Task status management
router.patch('/tasks/:taskId/mark-done', authenticate,markTaskDone);

module.exports = router;
