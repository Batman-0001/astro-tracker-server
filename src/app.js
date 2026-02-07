import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

import connectDB from "./config/db.js";
import asteroidRoutes from "./routes/asteroidRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import { initScheduler, runDailyFetch } from "./services/scheduler.js";
import ChatMessage from "./models/ChatMessage.js";
import jwt from "jsonwebtoken";
import { User } from "./models/index.js";

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// Parse allowed origins from environment variable
const allowedOrigins = (
  process.env.CORS_ORIGIN ||
  process.env.SOCKET_CORS_ORIGIN ||
  "http://localhost:5173,http://localhost:5174,http://localhost:3001,http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim());

const isProduction = process.env.NODE_ENV === "production";

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: isProduction ? allowedOrigins : "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["polling", "websocket"],
});

// Make io accessible to routes
app.set("io", io);

// ========== MIDDLEWARE ==========

// CORS — production: whitelist only; development: allow all
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      if (!isProduction) {
        // Allow everything in development
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("CORS blocked origin:", origin);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Handle preflight across all routes
app.options("*", cors());

// Body parsing
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Request logging (development)
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
    next();
  });
}

// ========== ROUTES ==========

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Welcome route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 Welcome to Astral NEO Monitoring API",
    version: "1.0.0",
    endpoints: {
      health: "GET /health",
      asteroids: {
        list: "GET /api/asteroids",
        stats: "GET /api/asteroids/stats",
        today: "GET /api/asteroids/today",
        single: "GET /api/asteroids/:id",
        hazardous: "GET /api/asteroids/hazardous/all",
      },
      auth: {
        register: "POST /api/auth/register",
        login: "POST /api/auth/login",
        profile: "GET /api/auth/me",
        watchlist: "GET /api/auth/watchlist",
      },
      alerts: {
        list: "GET /api/alerts",
        unread: "GET /api/alerts/unread",
        markRead: "PUT /api/alerts/:id/read",
        markAllRead: "PUT /api/alerts/read-all",
      },
      admin: {
        testNasa: "GET /api/admin/test-nasa",
        triggerFetch: "POST /api/admin/fetch",
        stats: "GET /api/admin/stats",
      },
    },
  });
});

// API routes
app.use("/api/asteroids", asteroidRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ========== SOCKET.IO EVENTS ==========

io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Join a room for specific asteroid updates
  socket.on("watch_asteroid", (asteroidId) => {
    socket.join(`asteroid:${asteroidId}`);
    console.log(`👁️ ${socket.id} watching asteroid: ${asteroidId}`);
  });

  // Leave asteroid room
  socket.on("unwatch_asteroid", (asteroidId) => {
    socket.leave(`asteroid:${asteroidId}`);
    console.log(`👁️ ${socket.id} stopped watching asteroid: ${asteroidId}`);
  });

  // Join user's personal notification room
  socket.on("join_user_room", (userId) => {
    socket.join(`user:${userId}`);
    console.log(`👤 ${socket.id} joined user room: ${userId}`);
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ========== CHAT NAMESPACE ==========

const chatNsp = io.of("/chat");

// Authenticate socket connections to the chat namespace
chatNsp.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select(
      "displayName email role",
    );
    if (!user) return next(new Error("User not found"));

    socket.user = {
      id: user._id.toString(),
      displayName: user.displayName,
      role: user.role,
    };
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

const chatUsers = new Map(); // socketId -> user info

chatNsp.on("connection", (socket) => {
  console.log(`💬 Chat connected: ${socket.user.displayName}`);

  // Track online user
  chatUsers.set(socket.id, socket.user);
  chatNsp.emit("chat:users_online", chatUsers.size);

  socket.join("global");

  // Join an asteroid-specific chat room
  socket.on("chat:join_room", (room) => {
    if (room && /^asteroid:[a-zA-Z0-9_-]+$/.test(room)) {
      socket.join(room);
      console.log(`💬 ${socket.user.displayName} joined room: ${room}`);
      // Notify room members
      const roomUsers = chatNsp.adapter.rooms.get(room);
      chatNsp.to(room).emit("chat:room_users_online", {
        room,
        count: roomUsers ? roomUsers.size : 0,
      });
    }
  });

  // Leave an asteroid-specific chat room
  socket.on("chat:leave_room", (room) => {
    if (room && room !== "global") {
      socket.leave(room);
      console.log(`💬 ${socket.user.displayName} left room: ${room}`);
      const roomUsers = chatNsp.adapter.rooms.get(room);
      chatNsp.to(room).emit("chat:room_users_online", {
        room,
        count: roomUsers ? roomUsers.size : 0,
      });
    }
  });

  // Handle incoming messages (supports room-based chat)
  socket.on("chat:send", async (data) => {
    try {
      const message = data?.message?.trim();
      const room = data?.room || "global";
      if (!message || message.length > 500) return;

      // Validate room
      if (room !== "global" && !/^asteroid:[a-zA-Z0-9_-]+$/.test(room)) return;

      const chatMsg = await ChatMessage.create({
        user: socket.user.id,
        displayName: socket.user.displayName,
        message,
        room,
      });

      chatNsp.to(room).emit("chat:message", {
        _id: chatMsg._id,
        user: socket.user.id,
        displayName: socket.user.displayName,
        message: chatMsg.message,
        room: chatMsg.room,
        createdAt: chatMsg.createdAt,
      });
    } catch (err) {
      console.error("Chat message error:", err);
      socket.emit("chat:error", "Failed to send message");
    }
  });

  // Typing indicators (supports room-based)
  socket.on("chat:typing", (data) => {
    const room = data?.room || "global";
    socket.to(room).emit("chat:user_typing", {
      displayName: socket.user.displayName,
      room,
    });
  });

  socket.on("chat:stop_typing", (data) => {
    const room = data?.room || "global";
    socket.to(room).emit("chat:user_stop_typing", {
      displayName: socket.user.displayName,
      room,
    });
  });

  socket.on("disconnect", () => {
    chatUsers.delete(socket.id);
    chatNsp.emit("chat:users_online", chatUsers.size);
    console.log(`💬 Chat disconnected: ${socket.user.displayName}`);
  });
});

// ========== START SERVER ==========

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Start HTTP server — bind to 0.0.0.0 so cloud hosts (Render) can reach it
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 ASTRAL NEO MONITORING SERVER                        ║
║                                                           ║
║   🌐 Server:     http://localhost:${PORT}                   ║
║   📡 Socket.IO:  ws://localhost:${PORT}                     ║
║   🗄️  Database:   MongoDB Connected                       ║
║   🌍 Environment: ${process.env.NODE_ENV || "development"}                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);

      // Initialize scheduler with Socket.IO
      initScheduler(io);

      // Fetch initial data on startup (in background)
      console.log("📡 Running initial asteroid fetch...");
      runDailyFetch();
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n⏳ Shutting down gracefully...");
  httpServer.close(() => {
    console.log("👋 Server closed");
    process.exit(0);
  });
});

export { app, io };
