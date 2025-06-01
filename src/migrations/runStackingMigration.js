// src/migrations/runStackingMigration.js
require('dotenv').config();
const { initializeFirebase } = require('../../config/firebase');
const { addStackingSystem, checkStackingConfig } = require('../utils/migrations/addStackingSystem');

async function runMigration() {
    try {
        console.log('Initializing Firebase...');
        await initializeFirebase();
        
        console.log('\nRunning stacking system migration...');
        const result = await addStackingSystem();
        
        if (result.success) {
            console.log('\n✅ Migration completed successfully!');
            console.log(`Updated ${result.updated} punishment types.`);
            
            // Show the current configuration
            await checkStackingConfig();
        } else {
            console.error('\n❌ Migration failed:', result.error);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run the migration
runMigration();