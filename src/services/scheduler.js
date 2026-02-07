/**
 * Scheduler Service
 * Manages cron jobs for periodic data fetching and alert checking
 */

import cron from 'node-cron';
import { fetchTodayNeos, fetchWeekNeos } from './nasaService.js';
import { calculateRiskScore } from './riskEngine.js';
import { checkAndDispatchAlerts, broadcastNewHazardousAsteroid } from './alertDispatcher.js';
import { Asteroid } from '../models/index.js';

let io = null;

/**
 * Process and store asteroids from NASA data
 * @param {Array} neoData - Array of asteroid objects from NASA
 * @returns {Object} Stats about processed data
 */
export const processAndStoreAsteroids = async (neoData) => {
    const stats = {
        total: neoData.length,
        processed: 0,
        hazardous: 0,
        highRisk: 0,
        errors: 0,
    };

    console.log(`📊 Processing ${neoData.length} asteroids...`);

    for (const neo of neoData) {
        try {
            // Calculate risk score
            const risk = calculateRiskScore(neo);

            // Upsert to database
            const asteroid = await Asteroid.upsertFromNASA(neo, risk.score, risk.category);

            stats.processed++;

            if (asteroid.isPotentiallyHazardous) {
                stats.hazardous++;
            }

            if (risk.category === 'high') {
                stats.highRisk++;
                // Broadcast high-risk asteroids
                if (io) {
                    broadcastNewHazardousAsteroid(asteroid, io);
                }
            }
        } catch (error) {
            console.error(`❌ Failed to process asteroid ${neo.name}:`, error.message);
            stats.errors++;
        }
    }

    console.log(`✅ Processed: ${stats.processed}/${stats.total} | Hazardous: ${stats.hazardous} | High Risk: ${stats.highRisk}`);

    return stats;
};

/**
 * Fetch and process today's asteroid data
 */
export const runDailyFetch = async () => {
    console.log('\n' + '='.repeat(50));
    console.log('🌅 Running daily asteroid data fetch...');
    console.log('='.repeat(50));

    try {
        // Fetch today's data
        const todayNeos = await fetchTodayNeos();

        if (todayNeos.length === 0) {
            console.log('⚠️ No asteroids fetched for today');
            return;
        }

        // Process and store
        const stats = await processAndStoreAsteroids(todayNeos);

        // Emit stats to connected clients
        if (io) {
            io.emit('DAILY_UPDATE', {
                type: 'daily_fetch_complete',
                stats,
                timestamp: new Date(),
            });
        }

        // Check for alerts
        await checkAndDispatchAlerts(io, 1);

        console.log('✅ Daily fetch complete!\n');
    } catch (error) {
        console.error('❌ Daily fetch failed:', error);
    }
};

/**
 * Fetch and process weekly asteroid data
 */
export const runWeeklyFetch = async () => {
    console.log('\n' + '='.repeat(50));
    console.log('📅 Running weekly asteroid data fetch...');
    console.log('='.repeat(50));

    try {
        const weekNeos = await fetchWeekNeos();

        if (weekNeos.length === 0) {
            console.log('⚠️ No asteroids fetched for the week');
            return;
        }

        const stats = await processAndStoreAsteroids(weekNeos);

        // Emit stats
        if (io) {
            io.emit('WEEKLY_UPDATE', {
                type: 'weekly_fetch_complete',
                stats,
                timestamp: new Date(),
            });
        }

        // Check for alerts with 7-day lookahead
        await checkAndDispatchAlerts(io, 7);

        console.log('✅ Weekly fetch complete!\n');
    } catch (error) {
        console.error('❌ Weekly fetch failed:', error);
    }
};

/**
 * Initialize cron jobs
 * @param {Object} socketIO - Socket.IO instance
 */
export const initScheduler = (socketIO) => {
    io = socketIO;

    console.log('⏰ Initializing scheduler...');

    // Daily fetch at 00:01 every day
    cron.schedule('1 0 * * *', () => {
        console.log('⏰ Cron: Daily fetch triggered');
        runDailyFetch();
    }, {
        timezone: 'UTC',
    });

    // Weekly comprehensive fetch every Monday at 00:30
    cron.schedule('30 0 * * 1', () => {
        console.log('⏰ Cron: Weekly fetch triggered');
        runWeeklyFetch();
    }, {
        timezone: 'UTC',
    });

    // Check for alerts every 6 hours
    cron.schedule('0 */6 * * *', () => {
        console.log('⏰ Cron: Alert check triggered');
        checkAndDispatchAlerts(io, 1);
    }, {
        timezone: 'UTC',
    });

    console.log('✅ Scheduler initialized with cron jobs:');
    console.log('   📆 Daily fetch: 00:01 UTC');
    console.log('   📅 Weekly fetch: Monday 00:30 UTC');
    console.log('   🔔 Alert check: Every 6 hours');
};

/**
 * Manual trigger for fetching data (for API endpoint)
 */
export const triggerManualFetch = async (type = 'today') => {
    if (type === 'week') {
        return await runWeeklyFetch();
    }
    return await runDailyFetch();
};

export default {
    initScheduler,
    runDailyFetch,
    runWeeklyFetch,
    processAndStoreAsteroids,
    triggerManualFetch,
};
