// src/utils/migrations/restructureForMultiplePunishments.js
const { getDb, getAdmin } = require('../../../config/firebase');

async function restructureDatabase() {
    const db = getDb();
    const admin = getAdmin();
    
    try {
        console.log('Starting database restructure for multiple punishments support...');
        
        // Step 1: Create new collections structure
        // Old structure: individuals/{robloxId} - one document per user
        // New structure: 
        //   - individuals/{robloxId} - user summary
        //   - punishments/{recordId} - individual punishment records
        
        const individualsSnapshot = await db.collection('individuals').get();
        const batch = db.batch();
        let punishmentCount = 0;
        
        for (const doc of individualsSnapshot.docs) {
            const userData = doc.data();
            const robloxId = doc.id;
            
            // Create punishment record in new collection
            const punishmentRef = db.collection('punishments').doc(userData.punishment_record_id.toString());
            
            const punishmentData = {
                punishment_record_id: userData.punishment_record_id,
                roblox_id: parseInt(robloxId),
                punishment_type: userData.punishment_type,
                current_tier: userData.current_tier || null,
                tier_uuid: userData.tier_uuid || null,
                blacklist_category: userData.blacklist_category || null,
                reason: userData.reason,
                evidence: userData.evidence,
                created_on: userData.created_on,
                created_by: userData.created_by || 'system',
                punishment_start_date: userData.punishment_start_date || userData.created_on,
                punishment_end_date: userData.punishment_end_date || null,
                is_active: userData.is_active !== false,
                removed_on: userData.removed_on || null,
                removed_by: userData.removed_by || null
            };
            
            batch.set(punishmentRef, punishmentData);
            
            // Update individuals document to be a summary
            const individualRef = db.collection('individuals').doc(robloxId);
            const summaryData = {
                roblox_id: parseInt(robloxId),
                punishment_history: userData.punishment_history || '',
                active_punishment_count: userData.is_active !== false ? 1 : 0,
                last_updated: admin.firestore.FieldValue.serverTimestamp()
            };
            
            batch.set(individualRef, summaryData, { merge: true });
            
            punishmentCount++;
        }
        
        await batch.commit();
        
        console.log(`✅ Migration complete! Migrated ${punishmentCount} punishment records.`);
        console.log('\nNew structure:');
        console.log('- individuals/{robloxId} - Contains user summary and history');
        console.log('- punishments/{recordId} - Contains individual punishment records');
        
        return { success: true, migratedCount: punishmentCount };
        
    } catch (error) {
        console.error('Migration failed:', error);
        return { success: false, error: error.message };
    }
}

// Helper function to check the new structure
async function verifyNewStructure() {
    const db = getDb();
    
    console.log('\nVerifying new structure...');
    
    // Check a few punishment records
    const punishmentsSnapshot = await db.collection('punishments').limit(5).get();
    console.log(`\nFound ${punishmentsSnapshot.size} punishment records (showing up to 5):`);
    
    punishmentsSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`- Record #${data.punishment_record_id}: ${data.punishment_type} for user ${data.roblox_id}`);
    });
    
    // Check individuals summary
    const individualsSnapshot = await db.collection('individuals').limit(3).get();
    console.log(`\nFound ${individualsSnapshot.size} individual summaries (showing up to 3):`);
    
    individualsSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`- User ${data.roblox_id}: ${data.active_punishment_count} active punishments`);
    });
}

module.exports = {
    restructureDatabase,
    verifyNewStructure
};