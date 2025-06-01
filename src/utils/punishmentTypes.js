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

// Counter to ensure uniqueness even when called rapidly
let idCounter = 0;

// Generate a unique 6-digit punishment record ID
async function getNextPunishmentId() {
    const db = getDb();
    const maxAttempts = 100; // Prevent infinite loops
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Use a combination of timestamp and counter for better uniqueness
        const now = Date.now();
        const timeComponent = parseInt(now.toString().slice(-5)); // Last 5 digits of timestamp
        const counterComponent = (idCounter++ % 10); // Single digit counter
        
        // Create 6-digit ID: first digit is 1-9, then timeComponent, then counter
        const firstDigit = Math.floor(Math.random() * 9) + 1; // 1-9
        let recordId = parseInt(`${firstDigit}${timeComponent}${counterComponent}`);
        
        // Ensure it's within valid range
        if (recordId > 999999) {
            // If too large, use different format
            recordId = 100000 + (now % 900000);
        }
        
        // Check if this ID already exists
        let exists = false;
        
        try {
            const punishmentDoc = await db.collection('punishments').doc(recordId.toString()).get();
            if (punishmentDoc.exists) {
                exists = true;
                console.log(`ID ${recordId} already exists, generating new one...`);
            }
        } catch (error) {
            // Collection might not exist yet, that's ok
        }
        
        // If ID doesn't exist, we found a unique one
        if (!exists) {
            console.log(`Generated unique punishment ID: ${recordId}`);
            return recordId;
        }
        
        // Add small delay to ensure different timestamp on next attempt
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Ultimate fallback: Use current timestamp with random suffix
    const fallbackId = parseInt(`${Date.now()}`.slice(-6));
    console.warn(`Warning: Using fallback ID: ${fallbackId}`);
    return fallbackId;
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