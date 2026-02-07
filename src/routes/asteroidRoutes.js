import express from 'express';
import { Asteroid } from '../models/index.js';

const router = express.Router();

// @route   GET /api/asteroids
// @desc    Get all cached asteroids with optional filters
// @access  Public
router.get('/', async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            sortBy = 'closeApproachDate',
            order = 'asc',
            riskCategory,
            hazardousOnly,
            minRiskScore,
            maxDistance,
        } = req.query;

        // Build query
        const query = {};

        if (riskCategory) {
            query.riskCategory = riskCategory;
        }

        if (hazardousOnly === 'true') {
            query.isPotentiallyHazardous = true;
        }

        if (minRiskScore) {
            query.riskScore = { $gte: parseInt(minRiskScore) };
        }

        if (maxDistance) {
            query.missDistanceLunar = { $lte: parseFloat(maxDistance) };
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = order === 'desc' ? -1 : 1;

        // Execute query
        const [asteroids, total] = await Promise.all([
            Asteroid.find(query)
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Asteroid.countDocuments(query),
        ]);

        res.json({
            success: true,
            data: asteroids,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
                hasMore: skip + asteroids.length < total,
            },
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/asteroids/stats
// @desc    Get dashboard statistics
// @access  Public
router.get('/stats', async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [
            totalTracked,
            hazardousCount,
            todayApproaches,
            highRiskCount,
            closestToday,
            riskDistribution,
        ] = await Promise.all([
            // Total asteroids in cache
            Asteroid.countDocuments(),

            // Potentially hazardous count
            Asteroid.countDocuments({ isPotentiallyHazardous: true }),

            // Approaches today
            Asteroid.countDocuments({
                closeApproachDate: { $gte: today, $lt: tomorrow },
            }),

            // High risk count
            Asteroid.countDocuments({ riskCategory: 'high' }),

            // Closest approach today
            Asteroid.findOne({
                closeApproachDate: { $gte: today, $lt: tomorrow },
            })
                .sort({ missDistanceKm: 1 })
                .lean(),

            // Risk distribution
            Asteroid.aggregate([
                { $group: { _id: '$riskCategory', count: { $sum: 1 } } },
            ]),
        ]);

        res.json({
            success: true,
            data: {
                totalTracked,
                hazardousCount,
                todayApproaches,
                highRiskCount,
                closestToday: closestToday ? {
                    name: closestToday.name,
                    distance: closestToday.missDistanceLunar?.toFixed(2) + ' LD',
                    distanceKm: Math.round(closestToday.missDistanceKm).toLocaleString() + ' km',
                    riskScore: closestToday.riskScore,
                } : null,
                riskDistribution: riskDistribution.reduce((acc, curr) => {
                    acc[curr._id || 'unknown'] = curr.count;
                    return acc;
                }, {}),
            },
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/asteroids/today
// @desc    Get today's approaching asteroids
// @access  Public
router.get('/today', async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const asteroids = await Asteroid.find({
            closeApproachDate: { $gte: today, $lt: tomorrow },
        })
            .sort({ missDistanceKm: 1 })
            .lean();

        res.json({
            success: true,
            count: asteroids.length,
            data: asteroids,
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/asteroids/:id
// @desc    Get single asteroid by neo_reference_id
// @access  Public
router.get('/:id', async (req, res, next) => {
    try {
        const asteroid = await Asteroid.findOne({
            neo_reference_id: req.params.id,
        }).lean();

        if (!asteroid) {
            return res.status(404).json({
                success: false,
                message: 'Asteroid not found',
            });
        }

        // Add size comparison
        const asteroidDoc = await Asteroid.findOne({
            neo_reference_id: req.params.id,
        });
        const sizeComparison = asteroidDoc.getSizeComparison();

        res.json({
            success: true,
            data: {
                ...asteroid,
                sizeComparison,
            },
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/asteroids/hazardous/all
// @desc    Get all potentially hazardous asteroids
// @access  Public
router.get('/hazardous/all', async (req, res, next) => {
    try {
        const asteroids = await Asteroid.find({ isPotentiallyHazardous: true })
            .sort({ riskScore: -1 })
            .lean();

        res.json({
            success: true,
            count: asteroids.length,
            data: asteroids,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
