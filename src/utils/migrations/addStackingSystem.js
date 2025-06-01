// src/utils/migrations/addStackingSystem.js
const { getDb } = require('../../../config/firebase');

async function addStackingSystem() {
    const db = getDb();
    
    try {
        console.log('Starting punishment stacking system migration...');
        
        // Default stacking configurations for each punishment type
        const stackingConfigs = {
            'reminder': { stack: true, stackmax: -1, nonconcurrency: [] },
            'warning': { stack: true, stackmax: -1, nonconcurrency: [] },
            'strike': { stack: true, stackmax: 3, nonconcurrency: [] },
            'demotion': { stack: false, stackmax: 1, nonconcurrency: [] },
            'suspension': { stack: false, stackmax: 1, nonconcurrency: [1006] }, // Can't coexist with blacklist
            'blacklist': { stack: false, stackmax: 1, nonconcurrency: [1005] }  // Can't coexist with suspension
        };
        
        // Get all punishment types
        const typesSnapshot = await db.collection('punishment_types').get();
        
        // Batch update
        const batch = db.batch();
        let updateCount = 0;
        
        typesSnapshot.forEach(doc => {
            const data = doc.data();
            const config = stackingConfigs[data.punishment_type] || { 
                stack: false, 
                stackmax: 1, 
                nonconcurrency: [] 
            };
            
            // Add the new fields
            batch.update(doc.ref, {
                stack: config.stack,
                stackmax: config.stackmax,
                nonconcurrency: config.nonconcurrency
            });
            
            updateCount++;
            console.log(`Updating ${data.punishment_type} with stacking config:`, config);
        });
        
        // Commit the batch
        await batch.commit();
        
        console.log(`Migration complete! Updated ${updateCount} punishment types.`);
        return { success: true, updated: updateCount };
        
    } catch (error) {
        console.error('Migration failed:', error);
        return { success: false, error: error.message };
    }
}

// Function to check current stacking configuration
async function checkStackingConfig() {
    const db = getDb();
    const typesSnapshot = await db.collection('punishment_types').get();
    
    console.log('\nCurrent Stacking Configuration:');
    console.log('================================');
    
    typesSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`\n${data.punishment_type.toUpperCase()} (UUID: ${data.type_uuid})`);
        console.log(`  Stack: ${data.stack ?? 'Not set'}`);
        console.log(`  Stack Max: ${data.stackmax ?? 'Not set'}`);
        console.log(`  Non-concurrent with: ${data.nonconcurrency ? data.nonconcurrency.join(', ') || 'None' : 'Not set'}`);
    });
}

module.exports = {
    addStackingSystem,
    checkStackingConfig
};