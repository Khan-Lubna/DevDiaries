const express = require('express');
const blogController = require('../controllers/blogController');
const requireAuth = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/dashboard', requireAuth, blogController.blog_dashboard);
router.get('/search', blogController.blog_search);
router.get('/', blogController.blog_index);

router.post('/', requireAuth, blogController.blog_create_post);

router.get('/create', requireAuth, blogController.blog_create_get);

router.get('/my-posts', requireAuth, blogController.blog_my_posts);

router.get('/my-drafts', requireAuth, blogController.blog_my_drafts);

router.get('/:id/edit', requireAuth, blogController.blog_edit_get);

router.post('/:id/edit', requireAuth, blogController.blog_edit_post);

router.get('/export-report', requireAuth, blogController.blog_export_report);
router.get('/:id', blogController.blog_details);

router.delete('/:id', blogController.blog_delete);

router.post('/update-goal', requireAuth, blogController.blog_update_goal);

module.exports = router;