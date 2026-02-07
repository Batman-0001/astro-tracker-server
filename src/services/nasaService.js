/**
 * NASA NeoWs API Service
 * Fetches Near-Earth Object data from NASA's API
 * API Docs: https://api.nasa.gov/
 */

const NASA_API_BASE = process.env.NASA_API_BASE_URL || 'https://api.nasa.gov/neo/rest/v1';
const NASA_API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY';

/**
 * Format date to YYYY-MM-DD
 */
const formatDate = (date) => {
    return date.toISOString().split('T')[0];
};

/**
 * Fetch NEO feed for a date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date (max 7 days from start)
 * @returns {Promise<Object>} NASA API response
 */
export const fetchNeoFeed = async (startDate = new Date(), endDate = null) => {
    try {
        // Default end date is same as start date
        if (!endDate) {
            endDate = new Date(startDate);
        }

        const start = formatDate(startDate);
        const end = formatDate(endDate);

        const url = `${NASA_API_BASE}/feed?start_date=${start}&end_date=${end}&api_key=${NASA_API_KEY}`;

        console.log(`🛰️  Fetching NEO data from NASA: ${start} to ${end}`);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`NASA API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        console.log(`✅ Fetched ${data.element_count} asteroids`);

        return {
            success: true,
            element_count: data.element_count,
            near_earth_objects: data.near_earth_objects,
        };
    } catch (error) {
        console.error('❌ NASA API fetch error:', error.message);
        return {
            success: false,
            error: error.message,
            near_earth_objects: {},
        };
    }
};

/**
 * Fetch today's NEO data
 * @returns {Promise<Array>} Array of asteroid objects
 */
export const fetchTodayNeos = async () => {
    const today = new Date();
    const result = await fetchNeoFeed(today, today);

    if (!result.success) {
        return [];
    }

    // Flatten the date-keyed object into an array
    const dateKey = formatDate(today);
    return result.near_earth_objects[dateKey] || [];
};

/**
 * Fetch NEO data for the next 7 days
 * @returns {Promise<Array>} Array of asteroid objects
 */
export const fetchWeekNeos = async () => {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 6); // 7 days total

    const result = await fetchNeoFeed(today, nextWeek);

    if (!result.success) {
        return [];
    }

    // Flatten all dates into a single array
    const allNeos = [];
    for (const dateKey of Object.keys(result.near_earth_objects)) {
        allNeos.push(...result.near_earth_objects[dateKey]);
    }

    return allNeos;
};

/**
 * Fetch single asteroid by ID
 * @param {string} asteroidId - NASA's neo_reference_id
 * @returns {Promise<Object|null>} Asteroid object or null
 */
export const fetchAsteroidById = async (asteroidId) => {
    try {
        const url = `${NASA_API_BASE}/neo/${asteroidId}?api_key=${NASA_API_KEY}`;

        console.log(`🔍 Fetching asteroid details: ${asteroidId}`);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`NASA API error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Fetched asteroid: ${data.name}`);

        return data;
    } catch (error) {
        console.error(`❌ Failed to fetch asteroid ${asteroidId}:`, error.message);
        return null;
    }
};

/**
 * Fetch browse endpoint (paginated list of all known NEOs)
 * @param {number} page - Page number
 * @param {number} size - Items per page (max 20)
 * @returns {Promise<Object>} Paginated asteroid data
 */
export const browseNeos = async (page = 0, size = 20) => {
    try {
        const url = `${NASA_API_BASE}/neo/browse?page=${page}&size=${size}&api_key=${NASA_API_KEY}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`NASA API error: ${response.status}`);
        }

        const data = await response.json();

        return {
            success: true,
            page: data.page,
            near_earth_objects: data.near_earth_objects,
        };
    } catch (error) {
        console.error('❌ NASA browse error:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
};

export default {
    fetchNeoFeed,
    fetchTodayNeos,
    fetchWeekNeos,
    fetchAsteroidById,
    browseNeos,
};
