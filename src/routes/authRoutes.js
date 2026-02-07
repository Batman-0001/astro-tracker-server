import express from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post("/register", async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;

    // Validate input
    if (!email || !password || !displayName) {
      return res.status(400).json({
        success: false,
        message: "Please provide email, password, and display name",
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Create user (password will be hashed by pre-save middleware)
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash: password,
      displayName,
    });

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // Find user and include password for comparison
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+passwordHash",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get("/me", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put("/profile", auth, async (req, res, next) => {
  try {
    const { displayName, avatar, alertSettings } = req.body;

    const updateData = {};
    if (displayName) updateData.displayName = displayName;
    if (avatar) updateData.avatar = avatar;
    if (alertSettings) updateData.alertSettings = alertSettings;

    const user = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/watchlist/:asteroidId
// @desc    Add asteroid to watchlist
// @access  Private
router.post("/watchlist/:asteroidId", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    await user.addToWatchlist(req.params.asteroidId);

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${user._id}`).emit("watchlist_updated", {
        action: "added",
        asteroidId: req.params.asteroidId,
      });
    }

    res.json({
      success: true,
      message: "Asteroid added to watchlist",
      data: user.watched_asteroid_ids,
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/auth/watchlist/:asteroidId
// @desc    Remove asteroid from watchlist
// @access  Private
router.delete("/watchlist/:asteroidId", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    await user.removeFromWatchlist(req.params.asteroidId);

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${user._id}`).emit("watchlist_updated", {
        action: "removed",
        asteroidId: req.params.asteroidId,
      });
    }

    res.json({
      success: true,
      message: "Asteroid removed from watchlist",
      data: user.watched_asteroid_ids,
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/auth/watchlist
// @desc    Get user's watchlist with asteroid details
// @access  Private
router.get("/watchlist", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    // Import Asteroid model
    const { Asteroid } = await import("../models/index.js");

    const asteroids = await Asteroid.find({
      neo_reference_id: { $in: user.watched_asteroid_ids },
    }).lean();

    res.json({
      success: true,
      count: asteroids.length,
      data: asteroids,
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/auth/account
// @desc    Delete user account and all associated data
// @access  Private
router.delete("/account", auth, async (req, res, next) => {
  try {
    const { Alert } = await import("../models/index.js");

    // Delete user's alerts
    await Alert.deleteMany({ userId: req.user.id });

    // Delete the user
    await User.findByIdAndDelete(req.user.id);

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
