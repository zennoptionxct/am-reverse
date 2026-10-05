const express = require('express');
const router = express.Router();

router.use('/status', require('./status/route'));
router.use('/send-link', require('./send-link/route'));
router.use('/verify-link', require('./verify-link/route'));
router.use('/stats', require('./stats/route'));
router.use('/tempmail', require('./tempmail/route'));
router.use('/capcut-search', require('./capcut-search/route'));
router.use('/web2apk', require('./web2apk/route'));

module.exports = router;
