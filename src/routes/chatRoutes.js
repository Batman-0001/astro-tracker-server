import express from "express";
import ChatMessage from "../models/ChatMessage.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// @route   GET /api/chat/messages
// @desc    Get recent chat messages (paginated, newest first)
// @access  Public
router.get("/messages", async (req, res, next) => {
  try {
    const { before, limit = 50, room = "global" } = req.query;

    // Validate room name
    if (room !== "global" && !/^asteroid:[a-zA-Z0-9_-]+$/.test(room)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid room name" });
    }

    const query = { room };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit), 100))
      .lean();

    // Return in chronological order for the client
    messages.reverse();

    res.json({
      success: true,
      data: messages,
      hasMore: messages.length === parseInt(limit),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
