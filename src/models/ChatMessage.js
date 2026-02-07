import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: [true, "Message cannot be empty"],
      trim: true,
      maxlength: [500, "Message cannot exceed 500 characters"],
    },
    room: {
      type: String,
      default: "global",
      validate: {
        validator: function (v) {
          return v === "global" || /^asteroid:[a-zA-Z0-9_-]+$/.test(v);
        },
        message: "Room must be 'global' or 'asteroid:<id>'",
      },
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient room-based queries sorted by time
chatMessageSchema.index({ room: 1, createdAt: -1 });

// Auto-expire messages after 7 days to keep the collection lean
chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);

export default ChatMessage;
