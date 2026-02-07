/**
 * Risk Analysis Engine
 * Calculates risk scores for asteroids based on multiple factors
 * 
 * Formula: Score = (HazardWeight × 40) + (DiameterScore × 25) + (DistanceScore × 25) + (VelocityScore × 10)
 * Normalized to 1-100 scale
 */

// Constants for normalization
const MAX_DIAMETER = 1000; // meters - anything larger gets max score
const MAX_VELOCITY = 30; // km/s - typical high-speed asteroid
const MIN_SAFE_DISTANCE = 1; // Lunar Distance - closer than this is concerning
const MAX_CONCERNING_DISTANCE = 50; // Lunar Distance - beyond this is relatively safe

/**
 * Calculate diameter-based risk score (0-100)
 * Larger asteroids = higher risk
 */
const calculateDiameterScore = (diameterMeters) => {
    if (!diameterMeters || diameterMeters <= 0) return 0;

    // Logarithmic scale for diameter (small ones are common, large rare but dangerous)
    // Using log scale: 10m = ~23, 100m = ~46, 500m = ~77, 1000m = 100
    const logScore = (Math.log10(diameterMeters) / Math.log10(MAX_DIAMETER)) * 100;
    return Math.min(100, Math.max(0, logScore));
};

/**
 * Calculate distance-based risk score (0-100)
 * Closer asteroids = higher risk
 */
const calculateDistanceScore = (lunarDistance) => {
    if (!lunarDistance || lunarDistance <= 0) return 100; // Unknown = assume worst

    if (lunarDistance <= MIN_SAFE_DISTANCE) {
        return 100; // Very close!
    }

    if (lunarDistance >= MAX_CONCERNING_DISTANCE) {
        return 0; // Far enough to not worry
    }

    // Inverse relationship: closer = higher score
    // Linear interpolation between MIN and MAX
    const score = ((MAX_CONCERNING_DISTANCE - lunarDistance) / (MAX_CONCERNING_DISTANCE - MIN_SAFE_DISTANCE)) * 100;
    return Math.min(100, Math.max(0, score));
};

/**
 * Calculate velocity-based risk score (0-100)
 * Faster asteroids = higher kinetic energy = higher risk
 */
const calculateVelocityScore = (velocityKmS) => {
    if (!velocityKmS || velocityKmS <= 0) return 0;

    const score = (velocityKmS / MAX_VELOCITY) * 100;
    return Math.min(100, Math.max(0, score));
};

/**
 * Determine risk category based on score
 */
const getRiskCategory = (score) => {
    if (score >= 76) return 'high';
    if (score >= 51) return 'moderate';
    if (score >= 26) return 'low';
    return 'minimal';
};

/**
 * Calculate overall risk score for an asteroid
 * @param {Object} asteroid - Asteroid data (from NASA API or our DB)
 * @returns {Object} { score: number, category: string, breakdown: Object }
 */
export const calculateRiskScore = (asteroid) => {
    // Extract data from NASA format or our DB format
    const isHazardous = asteroid.is_potentially_hazardous_asteroid ?? asteroid.isPotentiallyHazardous ?? false;

    // Get diameter (prefer max estimate in meters)
    let diameter = asteroid.estimatedDiameterMax;
    if (!diameter && asteroid.estimated_diameter?.meters) {
        diameter = asteroid.estimated_diameter.meters.estimated_diameter_max;
    }

    // Get miss distance in lunar distances
    let lunarDistance = asteroid.missDistanceLunar;
    if (!lunarDistance && asteroid.close_approach_data?.[0]) {
        lunarDistance = parseFloat(asteroid.close_approach_data[0].miss_distance?.lunar) || 0;
    }

    // Get velocity in km/s
    let velocity = asteroid.relativeVelocityKmS;
    if (!velocity && asteroid.close_approach_data?.[0]) {
        velocity = parseFloat(asteroid.close_approach_data[0].relative_velocity?.kilometers_per_second) || 0;
    }

    // Calculate individual scores
    const hazardWeight = isHazardous ? 100 : 0;
    const diameterScore = calculateDiameterScore(diameter);
    const distanceScore = calculateDistanceScore(lunarDistance);
    const velocityScore = calculateVelocityScore(velocity);

    // Weighted combination
    // Hazard status: 40%, Diameter: 25%, Distance: 25%, Velocity: 10%
    const totalScore = Math.round(
        (hazardWeight * 0.40) +
        (diameterScore * 0.25) +
        (distanceScore * 0.25) +
        (velocityScore * 0.10)
    );

    // Ensure score is in valid range
    const finalScore = Math.min(100, Math.max(1, totalScore));
    const category = getRiskCategory(finalScore);

    return {
        score: finalScore,
        category,
        breakdown: {
            hazardWeight: Math.round(hazardWeight * 0.40),
            diameterScore: Math.round(diameterScore * 0.25),
            distanceScore: Math.round(distanceScore * 0.25),
            velocityScore: Math.round(velocityScore * 0.10),
        },
        factors: {
            isHazardous,
            diameterMeters: diameter || 0,
            lunarDistance: lunarDistance || 0,
            velocityKmS: velocity || 0,
        },
    };
};

/**
 * Get risk level info for display
 */
export const getRiskLevelInfo = (category) => {
    const levels = {
        minimal: {
            label: 'Minimal Risk',
            color: '#22c55e',
            icon: '🟢',
            description: 'No significant threat. Standard monitoring.',
        },
        low: {
            label: 'Low Risk',
            color: '#eab308',
            icon: '🟡',
            description: 'Minor concern. Continued observation recommended.',
        },
        moderate: {
            label: 'Moderate Risk',
            color: '#f59e0b',
            icon: '🟠',
            description: 'Notable approach. Enhanced monitoring advised.',
        },
        high: {
            label: 'High Risk',
            color: '#ef4444',
            icon: '🔴',
            description: 'Significant concern. Close observation required.',
        },
    };

    return levels[category] || levels.minimal;
};

/**
 * Batch calculate risk scores for multiple asteroids
 * @param {Array} asteroids - Array of asteroid objects
 * @returns {Array} Asteroids with added riskScore and riskCategory
 */
export const calculateBatchRiskScores = (asteroids) => {
    return asteroids.map((asteroid) => {
        const risk = calculateRiskScore(asteroid);
        return {
            ...asteroid,
            riskScore: risk.score,
            riskCategory: risk.category,
            riskBreakdown: risk.breakdown,
        };
    });
};

export default {
    calculateRiskScore,
    getRiskLevelInfo,
    calculateBatchRiskScores,
    getRiskCategory,
};
