import express from "express";
import auth from "../middleware/auth.js";
import adminAuth from "../middleware/adminAuth.js";
import { triggerManualFetch } from "../services/scheduler.js";
import { fetchTodayNeos, fetchAsteroidById } from "../services/nasaService.js";
import {
  calculateRiskScore,
  getRiskLevelInfo,
} from "../services/riskEngine.js";

const router = express.Router();

// @route   POST /api/admin/fetch
// @desc    Manually trigger asteroid data fetch
// @access  Private (Admin only)
router.post("/fetch", auth, adminAuth, async (req, res, next) => {
  try {
    const { type = "today" } = req.body;

    console.log(
      `🔄 Manual fetch triggered by ${req.user.email} (type: ${type})`,
    );

    // Run the fetch in background
    triggerManualFetch(type);

    res.json({
      success: true,
      message: `${type === "week" ? "Weekly" : "Daily"} fetch initiated. Check server logs for progress.`,
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/test-nasa
// @desc    Test NASA API connection
// @access  Private (Admin only)
router.get("/test-nasa", auth, adminAuth, async (req, res, next) => {
  try {
    const startTime = Date.now();
    const neos = await fetchTodayNeos();
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: "NASA API connection successful",
      data: {
        asteroidsFound: neos.length,
        responseTimeMs: duration,
        sampleAsteroid:
          neos[0] ?
            {
              name: neos[0].name,
              id: neos[0].neo_reference_id || neos[0].id,
              isHazardous: neos[0].is_potentially_hazardous_asteroid,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/test-risk/:id
// @desc    Test risk calculation for a specific asteroid
// @access  Private (Admin only)
router.get("/test-risk/:id", auth, adminAuth, async (req, res, next) => {
  try {
    const asteroid = await fetchAsteroidById(req.params.id);

    if (!asteroid) {
      return res.status(404).json({
        success: false,
        message: "Asteroid not found",
      });
    }

    const risk = calculateRiskScore(asteroid);
    const levelInfo = getRiskLevelInfo(risk.category);

    res.json({
      success: true,
      data: {
        asteroid: {
          name: asteroid.name,
          id: asteroid.neo_reference_id || asteroid.id,
          isHazardous: asteroid.is_potentially_hazardous_asteroid,
        },
        risk: {
          ...risk,
          levelInfo,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/stats
// @desc    Get system stats
// @access  Private (Admin only)
router.get("/stats", auth, adminAuth, async (req, res, next) => {
  try {
    const { Asteroid, User, Alert } = await import("../models/index.js");

    const [
      totalAsteroids,
      hazardousCount,
      totalUsers,
      totalAlerts,
      unreadAlerts,
    ] = await Promise.all([
      Asteroid.countDocuments(),
      Asteroid.countDocuments({ isPotentiallyHazardous: true }),
      User.countDocuments(),
      Alert.countDocuments(),
      Alert.countDocuments({ isRead: false }),
    ]);

    res.json({
      success: true,
      data: {
        asteroids: {
          total: totalAsteroids,
          hazardous: hazardousCount,
        },
        users: totalUsers,
        alerts: {
          total: totalAlerts,
          unread: unreadAlerts,
        },
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
