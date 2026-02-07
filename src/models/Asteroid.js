import mongoose from 'mongoose';

const asteroidSchema = new mongoose.Schema(
    {
        // NASA's unique identifier
        neo_reference_id: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        nasa_jpl_url: {
            type: String,
        },
        absolute_magnitude_h: {
            type: Number,
        },

        // ========== INDEXED TOP-LEVEL FIELDS FOR FAST QUERIES ==========
        // These are extracted from raw_data for quick access and sorting

        // Risk score calculated by our engine (1-100)
        riskScore: {
            type: Number,
            min: 0,
            max: 100,
            default: 0,
            index: true,
        },
        riskCategory: {
            type: String,
            enum: ['minimal', 'low', 'moderate', 'high'],
            default: 'minimal',
            index: true,
        },

        // Is this asteroid potentially hazardous? (from NASA)
        isPotentiallyHazardous: {
            type: Boolean,
            default: false,
            index: true,
        },

        // Estimated diameter in meters (using max estimate)
        estimatedDiameterMin: {
            type: Number, // meters
        },
        estimatedDiameterMax: {
            type: Number, // meters
            index: true,
        },

        // Close approach data (most recent/relevant)
        closeApproachDate: {
            type: Date,
            index: true,
        },
        closeApproachDateFull: {
            type: String, // Full timestamp string from NASA
        },

        // Miss distance in various units
        missDistanceKm: {
            type: Number,
            index: true,
        },
        missDistanceAu: {
            type: Number, // Astronomical Units
        },
        missDistanceLunar: {
            type: Number, // Lunar distances
            index: true,
        },

        // Relative velocity
        relativeVelocityKmS: {
            type: Number, // km/s
            index: true,
        },
        relativeVelocityKmH: {
            type: Number, // km/h
        },

        // Orbiting body (usually Earth)
        orbitingBody: {
            type: String,
            default: 'Earth',
        },

        // ========== RAW NASA DATA ==========
        // Store the complete NASA response for reference
        raw_data: {
            type: mongoose.Schema.Types.Mixed,
        },

        // ========== TTL INDEX FOR AUTO-EXPIRATION ==========
        // Asteroid data expires after 24 hours to ensure freshness
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
            index: { expires: 0 }, // TTL index - MongoDB will auto-delete expired docs
        },

        // Track when data was last fetched from NASA
        lastFetchedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Compound indexes for common query patterns
asteroidSchema.index({ closeApproachDate: 1, riskScore: -1 });
asteroidSchema.index({ isPotentiallyHazardous: 1, closeApproachDate: 1 });
asteroidSchema.index({ riskCategory: 1, closeApproachDate: 1 });

// Static method to create/update asteroid from NASA data
asteroidSchema.statics.upsertFromNASA = async function (nasaData, riskScore, riskCategory) {
    const closeApproach = nasaData.close_approach_data?.[0] || {};
    const diameter = nasaData.estimated_diameter?.meters || {};

    const asteroidData = {
        neo_reference_id: nasaData.neo_reference_id || nasaData.id,
        name: nasaData.name,
        nasa_jpl_url: nasaData.nasa_jpl_url,
        absolute_magnitude_h: nasaData.absolute_magnitude_h,

        // Risk data
        riskScore,
        riskCategory,
        isPotentiallyHazardous: nasaData.is_potentially_hazardous_asteroid || false,

        // Diameter
        estimatedDiameterMin: diameter.estimated_diameter_min,
        estimatedDiameterMax: diameter.estimated_diameter_max,

        // Close approach
        closeApproachDate: closeApproach.close_approach_date_full
            ? new Date(closeApproach.close_approach_date_full)
            : new Date(closeApproach.close_approach_date),
        closeApproachDateFull: closeApproach.close_approach_date_full,

        // Miss distance
        missDistanceKm: parseFloat(closeApproach.miss_distance?.kilometers) || 0,
        missDistanceAu: parseFloat(closeApproach.miss_distance?.astronomical) || 0,
        missDistanceLunar: parseFloat(closeApproach.miss_distance?.lunar) || 0,

        // Velocity
        relativeVelocityKmS: parseFloat(closeApproach.relative_velocity?.kilometers_per_second) || 0,
        relativeVelocityKmH: parseFloat(closeApproach.relative_velocity?.kilometers_per_hour) || 0,

        orbitingBody: closeApproach.orbiting_body || 'Earth',

        // Raw data
        raw_data: nasaData,

        // Reset TTL
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastFetchedAt: new Date(),
    };

    return this.findOneAndUpdate(
        { neo_reference_id: asteroidData.neo_reference_id },
        asteroidData,
        { upsert: true, new: true, runValidators: true }
    );
};

// Instance method to get size comparison
asteroidSchema.methods.getSizeComparison = function () {
    const diameter = this.estimatedDiameterMax || 0;

    const comparisons = [
        { name: 'Car', size: 4.5, icon: '🚗' },
        { name: 'Bus', size: 12, icon: '🚌' },
        { name: 'Statue of Liberty', size: 93, icon: '🗽' },
        { name: 'Football Field', size: 109, icon: '🏈' },
        { name: 'Great Pyramid', size: 146, icon: '🔺' },
        { name: 'Eiffel Tower', size: 330, icon: '🗼' },
        { name: 'Empire State Building', size: 443, icon: '🏢' },
        { name: 'Burj Khalifa', size: 828, icon: '🏗️' },
    ];

    // Find the closest comparison
    let closest = comparisons[0];
    let minDiff = Math.abs(diameter - comparisons[0].size);

    for (const comparison of comparisons) {
        const diff = Math.abs(diameter - comparison.size);
        if (diff < minDiff) {
            minDiff = diff;
            closest = comparison;
        }
    }

    const ratio = (diameter / closest.size).toFixed(1);

    return {
        comparedTo: closest.name,
        icon: closest.icon,
        ratio: parseFloat(ratio),
        description: ratio === '1.0'
            ? `About the size of ${closest.name}`
            : ratio > 1
                ? `${ratio}x larger than ${closest.name}`
                : `${(1 / ratio).toFixed(1)}x smaller than ${closest.name}`,
    };
};

// Virtual for risk badge color
asteroidSchema.virtual('riskBadgeColor').get(function () {
    switch (this.riskCategory) {
        case 'high': return '#ef4444';
        case 'moderate': return '#f59e0b';
        case 'low': return '#eab308';
        case 'minimal':
        default: return '#22c55e';
    }
});

// Ensure virtuals are included in JSON output
asteroidSchema.set('toJSON', { virtuals: true });
asteroidSchema.set('toObject', { virtuals: true });

const Asteroid = mongoose.model('Asteroid', asteroidSchema);

export default Asteroid;
