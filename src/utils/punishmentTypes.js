// src/utils/punishmentTypes.js
const { getDb } = require('../../config/firebase');

let cachedTypes = null;
let cachedCategories = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getPunishmentTypes() {
    const now = Date.now();
    
    // Return cached data if still valid
    if (cachedTypes && (now - cacheTimestamp) < CACHE_DURATION) {
        return cachedTypes;
    }

    const db = getDb();
    const typesSnapshot = await db.collection('punishment_types').get();
    
    const types = {};
    typesSnapshot.forEach(doc => {
        const data = doc.data();
        types[data.punishment_type] = data.type_uuid;
    });

    cachedTypes = types;
    cacheTimestamp = now;
    
    return types;
}

async function getBlacklistCategories() {
    const now = Date.now();
    
    // Return cached data if still valid
    if (cachedCategories && (now - cacheTimestamp) < CACHE_DURATION) {
        return cachedCategories;
    }

    const db = getDb();
    const tiersSnapshot = await db.collection('punishment_tiers')
        .where('category', '!=', null)
        .get();
    
    const categories = {};
    tiersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.category) {
            categories[data.category.toLowerCase()] = data.punishment_tier;
        }
    });
    
    cachedCategories = categories;
    
    return categories;
}

// Get next punishment record ID
async function getNextPunishmentId() {
    const db = getDb();
    const snapshot = await db.collection('individuals').get();
    
    let maxId = 1000; // Starting ID
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.punishment_record_id && data.punishment_record_id > maxId) {
            maxId = data.punishment_record_id;
        }
    });
    
    return maxId + 1;
}

// Clear cache when types are updated
function clearCache() {
    cachedTypes = null;
    cachedCategories = null;
    cacheTimestamp = 0;
}

module.exports = {
    getPunishmentTypes,
    getBlacklistCategories,
    getNextPunishmentId,
    clearCache
};