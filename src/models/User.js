import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
        },
        passwordHash: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [6, 'Password must be at least 6 characters'],
            select: false, // Don't return password in queries by default
        },
        displayName: {
            type: String,
            required: [true, 'Display name is required'],
            trim: true,
            minlength: [2, 'Display name must be at least 2 characters'],
            maxlength: [50, 'Display name cannot exceed 50 characters'],
        },
        avatar: {
            type: String,
            default: null,
        },
        role: {
            type: String,
            enum: ['user', 'researcher', 'admin'],
            default: 'user',
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        // Watchlist - Array of asteroid IDs the user is tracking
        watched_asteroid_ids: [
            {
                type: String, // NASA's neo_reference_id
                ref: 'Asteroid',
            },
        ],
        // Custom alert settings
        alertSettings: {
            enabled: {
                type: Boolean,
                default: true,
            },
            minDiameter: {
                type: Number,
                default: 100, // meters - only alert for asteroids larger than this
            },
            maxDistance: {
                type: Number,
                default: 10, // lunar distances - only alert if closer than this
            },
            riskThreshold: {
                type: Number,
                min: 1,
                max: 100,
                default: 50, // only alert if risk score is above this
            },
            emailNotifications: {
                type: Boolean,
                default: false,
            },
            pushNotifications: {
                type: Boolean,
                default: true,
            },
        },
        // For password reset
        passwordResetToken: String,
        passwordResetExpires: Date,
        // Last login tracking
        lastLogin: Date,
    },
    {
        timestamps: true, // Adds createdAt and updatedAt
    }
);

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ watched_asteroid_ids: 1 });

// Hash password before saving
userSchema.pre('save', async function (next) {
    // Only hash if password is modified
    if (!this.isModified('passwordHash')) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(12);
        this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// Method to check if asteroid is in watchlist
userSchema.methods.isWatching = function (asteroidId) {
    return this.watched_asteroid_ids.includes(asteroidId);
};

// Method to add asteroid to watchlist
userSchema.methods.addToWatchlist = function (asteroidId) {
    if (!this.isWatching(asteroidId)) {
        this.watched_asteroid_ids.push(asteroidId);
    }
    return this.save();
};

// Method to remove asteroid from watchlist
userSchema.methods.removeFromWatchlist = function (asteroidId) {
    this.watched_asteroid_ids = this.watched_asteroid_ids.filter(
        (id) => id !== asteroidId
    );
    return this.save();
};

// Remove sensitive fields when converting to JSON
userSchema.methods.toJSON = function () {
    const user = this.toObject();
    delete user.passwordHash;
    delete user.passwordResetToken;
    delete user.passwordResetExpires;
    delete user.__v;
    return user;
};

const User = mongoose.model('User', userSchema);

export default User;
