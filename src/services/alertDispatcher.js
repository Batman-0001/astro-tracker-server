/**
 * Alert Dispatcher Service
 * Checks for close approaches and sends alerts to watching users
 */

import { User, Asteroid, Alert } from '../models/index.js';

/**
 * Check if an asteroid matches a user's alert thresholds
 */
const matchesUserThresholds = (asteroid, alertSettings) => {
    // Check diameter threshold
    if (alertSettings.minDiameter && asteroid.estimatedDiameterMax < alertSettings.minDiameter) {
        return false;
    }

    // Check distance threshold
    if (alertSettings.maxDistance && asteroid.missDistanceLunar > alertSettings.maxDistance) {
        return false;
    }

    // Check risk score threshold
    if (alertSettings.riskThreshold && asteroid.riskScore < alertSettings.riskThreshold) {
        return false;
    }

    return true;
};

/**
 * Create alert for a user about an asteroid
 */
const createAlertForUser = async (user, asteroid, io) => {
    try {
        // Check if we already sent an alert for this asteroid today
        const existingAlert = await Alert.findOne({
            userId: user._id,
            asteroidId: asteroid.neo_reference_id,
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        });

        if (existingAlert) {
            console.log(`⏭️  Alert already sent to ${user.email} for ${asteroid.name}`);
            return null;
        }

        // Create the alert
        const alert = await Alert.createCloseApproachAlert(user, asteroid);

        console.log(`📨 Alert created for ${user.email}: ${asteroid.name}`);

        // Send real-time notification via Socket.IO
        if (io) {
            io.to(`user:${user._id}`).emit('CLOSE_APPROACH_ALERT', {
                alertId: alert._id,
                type: alert.type,
                severity: alert.severity,
                title: alert.title,
                message: alert.message,
                asteroid: {
                    id: asteroid.neo_reference_id,
                    name: asteroid.name,
                    riskScore: asteroid.riskScore,
                    riskCategory: asteroid.riskCategory,
                    missDistanceLunar: asteroid.missDistanceLunar,
                    closeApproachDate: asteroid.closeApproachDate,
                },
                timestamp: new Date(),
            });
        }

        return alert;
    } catch (error) {
        console.error(`❌ Failed to create alert for ${user.email}:`, error.message);
        return null;
    }
};

/**
 * Check all asteroids approaching in the next N days and alert relevant users
 * @param {Object} io - Socket.IO instance
 * @param {number} daysAhead - How many days to look ahead (default: 1)
 */
export const checkAndDispatchAlerts = async (io, daysAhead = 1) => {
    try {
        console.log('🔔 Running alert dispatcher...');

        const now = new Date();
        const futureDate = new Date(now);
        futureDate.setDate(futureDate.getDate() + daysAhead);

        // Find asteroids approaching soon
        const upcomingAsteroids = await Asteroid.find({
            closeApproachDate: { $gte: now, $lte: futureDate },
        }).lean();

        if (upcomingAsteroids.length === 0) {
            console.log('📭 No upcoming close approaches in the next ' + daysAhead + ' day(s)');
            return { alertsSent: 0 };
        }

        console.log(`🌠 Found ${upcomingAsteroids.length} asteroids approaching soon`);

        let totalAlertsSent = 0;

        // For each asteroid, find users who are watching it or match their thresholds
        for (const asteroid of upcomingAsteroids) {
            // Find users watching this specific asteroid
            const watchingUsers = await User.find({
                watched_asteroid_ids: asteroid.neo_reference_id,
                'alertSettings.enabled': true,
            });

            // Also find users with matching thresholds (for high-risk asteroids)
            let thresholdUsers = [];
            if (asteroid.riskScore >= 50) {
                thresholdUsers = await User.find({
                    'alertSettings.enabled': true,
                    'alertSettings.riskThreshold': { $lte: asteroid.riskScore },
                    watched_asteroid_ids: { $ne: asteroid.neo_reference_id }, // Don't duplicate
                });
            }

            const usersToAlert = [...watchingUsers, ...thresholdUsers];

            for (const user of usersToAlert) {
                if (matchesUserThresholds(asteroid, user.alertSettings)) {
                    const alert = await createAlertForUser(user, asteroid, io);
                    if (alert) totalAlertsSent++;
                }
            }
        }

        console.log(`✅ Alert dispatch complete. Sent ${totalAlertsSent} alerts.`);
        return { alertsSent: totalAlertsSent };
    } catch (error) {
        console.error('❌ Alert dispatcher error:', error);
        return { alertsSent: 0, error: error.message };
    }
};

/**
 * Send a global broadcast about a new hazardous asteroid
 * @param {Object} asteroid - Asteroid data
 * @param {Object} io - Socket.IO instance
 */
export const broadcastNewHazardousAsteroid = (asteroid, io) => {
    if (!io) return;

    io.emit('NEW_HAZARDOUS_ASTEROID', {
        type: 'hazardous_spotted',
        asteroid: {
            id: asteroid.neo_reference_id,
            name: asteroid.name,
            riskScore: asteroid.riskScore,
            riskCategory: asteroid.riskCategory,
            isPotentiallyHazardous: asteroid.isPotentiallyHazardous,
            estimatedDiameterMax: asteroid.estimatedDiameterMax,
            missDistanceLunar: asteroid.missDistanceLunar,
            closeApproachDate: asteroid.closeApproachDate,
        },
        timestamp: new Date(),
    });

    console.log(`📢 Broadcasted new hazardous asteroid: ${asteroid.name}`);
};

/**
 * Get user's unread alerts
 */
export const getUnreadAlerts = async (userId) => {
    return Alert.find({
        userId,
        isRead: false,
    })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
};

/**
 * Mark alert as read
 */
export const markAlertRead = async (alertId, userId) => {
    return Alert.findOneAndUpdate(
        { _id: alertId, userId },
        { isRead: true },
        { new: true }
    );
};

/**
 * Mark all user alerts as read
 */
export const markAllAlertsRead = async (userId) => {
    return Alert.updateMany(
        { userId, isRead: false },
        { isRead: true }
    );
};

export default {
    checkAndDispatchAlerts,
    broadcastNewHazardousAsteroid,
    getUnreadAlerts,
    markAlertRead,
    markAllAlertsRead,
};
