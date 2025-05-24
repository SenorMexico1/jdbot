// src/utils/firebase.js
const { getDb, getAdmin } = require('../../config/firebase');

// Initialize default punishment data - ONLY RUN ONCE FOR INITIAL SETUP
async function initializePunishmentData() {
    const db = getDb();
    
    try {
        // Check if already initialized
        const typesSnapshot = await db.collection('punishment_types').get();
        if (!typesSnapshot.empty) {
            console.log('Punishment data already exists - skipping initialization');
            return;
        }

        console.log('First time setup - initializing default punishment data...');

        // Default punishment types - SINGULAR NAMES
        const punishmentTypes = [
            { punishment_type: 'reminder', type_uuid: 1001 },
            { punishment_type: 'warning', type_uuid: 1002 },
            { punishment_type: 'strike', type_uuid: 1003 },
            { punishment_type: 'demotion', type_uuid: 1004 },
            { punishment_type: 'suspension', type_uuid: 1005 },
            { punishment_type: 'blacklist', type_uuid: 1006 }
        ];

        // Default punishment tiers - ALL YOUR DEFAULTS
        const punishmentTiers = [
            // Basic punishments
            { type_uuid: 1001, punishment_tier: 1, tier_uuid: 2001, length: 90 },
            { type_uuid: 1002, punishment_tier: 1, tier_uuid: 2002, length: 90 },
            { type_uuid: 1003, punishment_tier: 1, tier_uuid: 2003, length: 90 },
            { type_uuid: 1004, punishment_tier: 1, tier_uuid: 2004, length: null }, // n/a
            
            // Suspensions - all 18 tiers
            { type_uuid: 1005, punishment_tier: 1, tier_uuid: 2010, length: 1 },
            { type_uuid: 1005, punishment_tier: 2, tier_uuid: 2011, length: 7 },
            { type_uuid: 1005, punishment_tier: 3, tier_uuid: 2012, length: 14 },
            { type_uuid: 1005, punishment_tier: 4, tier_uuid: 2013, length: 21 },
            { type_uuid: 1005, punishment_tier: 5, tier_uuid: 2014, length: 30 },
            { type_uuid: 1005, punishment_tier: 6, tier_uuid: 2015, length: 42 },
            { type_uuid: 1005, punishment_tier: 7, tier_uuid: 2016, length: 60 },
            { type_uuid: 1005, punishment_tier: 8, tier_uuid: 2017, length: 90 },
            { type_uuid: 1005, punishment_tier: 9, tier_uuid: 2018, length: 120 },
            { type_uuid: 1005, punishment_tier: 10, tier_uuid: 2019, length: 180 },
            { type_uuid: 1005, punishment_tier: 11, tier_uuid: 2020, length: 240 },
            { type_uuid: 1005, punishment_tier: 12, tier_uuid: 2021, length: 300 },
            { type_uuid: 1005, punishment_tier: 13, tier_uuid: 2022, length: 365 },
            { type_uuid: 1005, punishment_tier: 14, tier_uuid: 2023, length: 540 },
            { type_uuid: 1005, punishment_tier: 15, tier_uuid: 2024, length: 730 },
            { type_uuid: 1005, punishment_tier: 16, tier_uuid: 2025, length: 1095 },
            { type_uuid: 1005, punishment_tier: 17, tier_uuid: 2026, length: 1460 },
            { type_uuid: 1005, punishment_tier: 18, tier_uuid: 2027, length: 1825 },
            
            // Blacklists with categories
            { type_uuid: 1006, punishment_tier: 1, tier_uuid: 2040, length: -1, category: 'degeneracy' },
            { type_uuid: 1006, punishment_tier: 2, tier_uuid: 2041, length: -1, category: 'exploit/cheats (repeated 3+ times)' },
            { type_uuid: 1006, punishment_tier: 3, tier_uuid: 2042, length: -1, category: 'ddos' },
            { type_uuid: 1006, punishment_tier: 4, tier_uuid: 2043, length: -1, category: 'alt account (of blacklisted person)' },
            { type_uuid: 1006, punishment_tier: 5, tier_uuid: 2044, length: -1, category: 'scamming' },
            { type_uuid: 1006, punishment_tier: 6, tier_uuid: 2045, length: -1, category: 'doxxing' },
            { type_uuid: 1006, punishment_tier: 7, tier_uuid: 2046, length: -1, category: 'grooming' }
        ];

        // Use batch for initial setup
        const batch = db.batch();
        
        // Store initial punishment types
        for (const pType of punishmentTypes) {
            const docRef = db.collection('punishment_types').doc(pType.type_uuid.toString());
            batch.set(docRef, pType);
        }

        // Store initial punishment tiers
        for (const tier of punishmentTiers) {
            const docRef = db.collection('punishment_tiers').doc(tier.tier_uuid.toString());
            batch.set(docRef, tier);
        }

        // Commit the batch
        await batch.commit();
        
        console.log('Initial punishment data setup complete!');
        console.log('Created:');
        console.log('- 6 punishment types (singular names)');
        console.log('- 18 suspension tiers (1 day to 5 years)');
        console.log('- 7 blacklist categories');
        console.log('\nUse /punishment-config commands to manage types and tiers from now on.');
    } catch (error) {
        console.error('Error initializing punishment data:', error);
        throw error;
    }
}

// Helper function to calculate end date
function calculateEndDate(startDate, lengthInDays) {
    if (!lengthInDays || lengthInDays === -1 || lengthInDays === null) {
        return null;
    }
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + lengthInDays);
    return endDate;
}

// Get individual by Roblox ID - Admin SDK syntax
async function getIndividualByRobloxId(robloxId) {
    const db = getDb();
    const docSnap = await db.collection('individuals').doc(robloxId.toString()).get();
    
    if (docSnap.exists) {
        return { id: docSnap.id, data: docSnap.data() };
    }
    return null;
}

// Get individual by record ID - Admin SDK syntax
async function getIndividualByRecordId(recordId) {
    const db = getDb();
    const snapshot = await db.collection('individuals')
        .where('punishment_record_id', '==', recordId)
        .get();
    
    if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, data: doc.data() };
    }
    return null;
}

module.exports = {
    initializePunishmentData,
    calculateEndDate,
    getIndividualByRobloxId,
    getIndividualByRecordId
};