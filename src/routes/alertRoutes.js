import express from 'express';
import auth from '../middleware/auth.js';
import { getUnreadAlerts, markAlertRead, markAllAlertsRead } from '../services/alertDispatcher.js';
import { Alert } from '../models/index.js';

const router = express.Router();

// @route   GET /api/alerts
// @desc    Get user's alerts (paginated)
// @access  Private
router.get('/', auth, async (req, res, next) => {
    try {
        const { page = 1, limit = 20, unreadOnly = false } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = { userId: req.user.id };
        if (unreadOnly === 'true') {
            query.isRead = false;
        }

        const [alerts, total, unreadCount] = await Promise.all([
            Alert.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Alert.countDocuments(query),
            Alert.countDocuments({ userId: req.user.id, isRead: false }),
        ]);

        res.json({
            success: true,
            data: alerts,
            unreadCount,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/alerts/unread
// @desc    Get user's unread alerts
// @access  Private
router.get('/unread', auth, async (req, res, next) => {
    try {
        const alerts = await getUnreadAlerts(req.user.id);

        res.json({
            success: true,
            count: alerts.length,
            data: alerts,
        });
    } catch (error) {
        next(error);
    }
});

// @route   PUT /api/alerts/:id/read
// @desc    Mark single alert as read
// @access  Private
router.put('/:id/read', auth, async (req, res, next) => {
    try {
        const alert = await markAlertRead(req.params.id, req.user.id);

        if (!alert) {
            return res.status(404).json({
                success: false,
                message: 'Alert not found',
            });
        }

        res.json({
            success: true,
            data: alert,
        });
    } catch (error) {
        next(error);
    }
});

// @route   PUT /api/alerts/read-all
// @desc    Mark all user alerts as read
// @access  Private
router.put('/read-all', auth, async (req, res, next) => {
    try {
        const result = await markAllAlertsRead(req.user.id);

        res.json({
            success: true,
            message: `Marked ${result.modifiedCount} alerts as read`,
        });
    } catch (error) {
        next(error);
    }
});

// @route   DELETE /api/alerts/:id
// @desc    Delete an alert
// @access  Private
router.delete('/:id', auth, async (req, res, next) => {
    try {
        const alert = await Alert.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id,
        });

        if (!alert) {
            return res.status(404).json({
                success: false,
                message: 'Alert not found',
            });
        }

        res.json({
            success: true,
            message: 'Alert deleted',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
