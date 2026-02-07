import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema(
    {
        // User who should receive this alert
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        // Asteroid that triggered the alert
        asteroidId: {
            type: String, // neo_reference_id
            required: true,
            index: true,
        },
        asteroidName: {
            type: String,
            required: true,
        },
        // Alert type
        type: {
            type: String,
            enum: ['close_approach', 'high_risk', 'watched_update', 'new_hazardous'],
            required: true,
        },
        // Alert severity
        severity: {
            type: String,
            enum: ['info', 'warning', 'danger'],
            default: 'info',
        },
        // Alert title and message
        title: {
            type: String,
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        // Additional data
        data: {
            riskScore: Number,
            missDistanceKm: Number,
            missDistanceLunar: Number,
            closeApproachDate: Date,
            velocity: Number,
            diameter: Number,
        },
        // Read status
        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },
        // Delivery status
        deliveredVia: {
            dashboard: { type: Boolean, default: false },
            push: { type: Boolean, default: false },
            email: { type: Boolean, default: false },
        },
        // When the close approach event occurs
        eventDate: {
            type: Date,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound indexes
alertSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
alertSchema.index({ userId: 1, type: 1, createdAt: -1 });

// Static method to create a close approach alert
alertSchema.statics.createCloseApproachAlert = async function (user, asteroid) {
    const lunarDist = asteroid.missDistanceLunar?.toFixed(2) || 'N/A';

    let severity = 'info';
    if (asteroid.riskScore >= 75) severity = 'danger';
    else if (asteroid.riskScore >= 50) severity = 'warning';

    return this.create({
        userId: user._id,
        asteroidId: asteroid.neo_reference_id,
        asteroidName: asteroid.name,
        type: 'close_approach',
        severity,
        title: `🚨 Close Approach Alert: ${asteroid.name}`,
        message: `Asteroid ${asteroid.name} will pass within ${lunarDist} lunar distances of Earth. Risk Score: ${asteroid.riskScore}/100`,
        data: {
            riskScore: asteroid.riskScore,
            missDistanceKm: asteroid.missDistanceKm,
            missDistanceLunar: asteroid.missDistanceLunar,
            closeApproachDate: asteroid.closeApproachDate,
            velocity: asteroid.relativeVelocityKmS,
            diameter: asteroid.estimatedDiameterMax,
        },
        eventDate: asteroid.closeApproachDate,
    });
};

// Instance method to mark as read
alertSchema.methods.markAsRead = function () {
    this.isRead = true;
    return this.save();
};

const Alert = mongoose.model('Alert', alertSchema);

export default Alert;
