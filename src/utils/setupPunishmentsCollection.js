// src/utils/setupPunishmentsCollection.js
// Load environment variables at the very beginning
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

async function setupPunishmentsCollection() {
    const { getDb } = require('../../config/firebase');
    const db = getDb();
    
    try {
        console.log('Setting up punishments collection for multiple active punishments support...');
        
        // Get all existing individuals
        const individualsSnapshot = await db.collection('individuals').get();
        let created = 0;
        let skipped = 0;
        
        for (const doc of individualsSnapshot.docs) {
            const userData = doc.data();
            const robloxId = doc.id;
            
            // Only create punishment record if user has a punishment_record_id
            if (userData.punishment_record_id) {
                // Check if this punishment already exists
                const existingPunishment = await db.collection('punishments')
                    .doc(userData.punishment_record_id.toString())
                    .get();
                
                if (!existingPunishment.exists) {
                    // Create punishment record
                    await db.collection('punishments')
                        .doc(userData.punishment_record_id.toString())
                        .set({
                            punishment_record_id: userData.punishment_record_id,
                            roblox_id: parseInt(robloxId),
                            punishment_type: userData.punishment_type,
                            current_tier: userData.current_tier || null,
                            tier_uuid: userData.tier_uuid || null,
                            blacklist_category: userData.blacklist_category || null,
                            reason: userData.reason || 'No reason provided',
                            evidence: userData.evidence || 'No evidence provided',
                            created_on: userData.created_on,
                            punishment_start_date: userData.punishment_start_date || userData.created_on,
                            punishment_end_date: userData.punishment_end_date || null,
                            is_active: userData.is_active !== false,
                            removed_on: userData.removed_on || null,
                            removed_by: userData.removed_by || null
                        });
                    
                    created++;
                    console.log(`✅ Created punishment record #${userData.punishment_record_id} for user ${robloxId}`);
                } else {
                    skipped++;
                    console.log(`⏭️ Skipped existing punishment record #${userData.punishment_record_id}`);
                }
            }
        }
        
        console.log('\n✅ Setup complete!');
        console.log(`Created: ${created} punishment records`);
        console.log(`Skipped: ${skipped} existing records`);
        console.log('\nThe punishments collection is now ready to support multiple active punishments per user.');
        console.log('The /get command will now show other active punishments when available.');
        
    } catch (error) {
        console.error('Setup failed:', error);
    }
}

// Run if called directly
if (require.main === module) {
    async function main() {
        console.log('🚀 Starting punishments collection setup...\n');
        
        // Validate environment variables
        console.log('📋 Checking environment variables...');
        
        const requiredEnvVars = [
            'FIREBASE_PROJECT_ID',
            'FIREBASE_CLIENT_EMAIL', 
            'FIREBASE_PRIVATE_KEY'
        ];
        
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            console.error('❌ Missing required environment variables:', missingVars.join(', '));
            console.error('\nPlease ensure your .env file contains:');
            console.error('FIREBASE_PROJECT_ID=your-project-id');
            console.error('FIREBASE_CLIENT_EMAIL=your-client-email');
            console.error('FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_KEY_HERE\\n-----END PRIVATE KEY-----\\n"');
            console.error('\nNote: Make sure FIREBASE_PRIVATE_KEY is wrapped in quotes and uses \\n for line breaks');
            process.exit(1);
        }
        
        // Check if private key format looks correct
        const privateKey = process.env.FIREBASE_PRIVATE_KEY;
        if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
            console.error('❌ FIREBASE_PRIVATE_KEY appears to be incorrectly formatted');
            console.error('It should start with: -----BEGIN PRIVATE KEY-----');
            console.error('Make sure to wrap the entire key in quotes in your .env file');
            process.exit(1);
        }
        
        console.log('✅ Environment variables loaded successfully\n');
        
        // Now import Firebase after env vars are loaded
        const { initializeFirebase } = require('../../config/firebase');
        
        try {
            // Initialize Firebase
            console.log('🔥 Initializing Firebase...');
            await initializeFirebase();
            console.log('✅ Firebase initialized successfully\n');
            
            await setupPunishmentsCollection();
            
        } catch (error) {
            console.error('\n❌ Setup failed:', error.message);
            console.error('\nFull error:', error);
            process.exit(1);
        }
    }
    
    main().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Unexpected error:', error);
        process.exit(1);
    });
}

module.exports = { setupPunishmentsCollection };