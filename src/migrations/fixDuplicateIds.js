// src/migrations/fixDuplicateIds.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

async function fixDuplicateIds() {
    console.log('🔧 Starting duplicate ID fix...\n');
    
    // Initialize Firebase
    const { initializeFirebase, getDb } = require('../../config/firebase');
    await initializeFirebase();
    
    const db = getDb();
    
    try {
        // Step 1: Ensure punishments collection exists
        console.log('📋 Checking punishments collection...');
        
        // Get all individuals first
        const individualsSnapshot = await db.collection('individuals').get();
        console.log(`Found ${individualsSnapshot.size} users in individuals collection\n`);
        
        // Map to track which IDs we've seen
        const usedIds = new Set();
        const punishmentsToCreate = [];
        
        // Step 2: Check each individual's punishment
        for (const doc of individualsSnapshot.docs) {
            const userData = doc.data();
            const robloxId = doc.id;
            
            if (userData.punishment_record_id) {
                console.log(`\n👤 User ${robloxId}:`);
                console.log(`  Current Record ID: ${userData.punishment_record_id}`);
                console.log(`  Type: ${userData.punishment_type}`);
                console.log(`  Active: ${userData.is_active !== false}`);
                
                // Generate new ID if duplicate
                let finalRecordId = userData.punishment_record_id;
                
                if (usedIds.has(userData.punishment_record_id)) {
                    // Generate new unique ID
                    finalRecordId = Math.floor(100000 + Math.random() * 900000);
                    while (usedIds.has(finalRecordId)) {
                        finalRecordId = Math.floor(100000 + Math.random() * 900000);
                    }
                    
                    console.log(`  ⚠️ Duplicate ID detected! New ID: ${finalRecordId}`);
                    
                    // Update the individual document with new ID
                    await doc.ref.update({
                        punishment_record_id: finalRecordId
                    });
                    
                    // Update punishment history to reflect new ID
                    if (userData.punishment_history) {
                        const updatedHistory = userData.punishment_history.replace(
                            `#${userData.punishment_record_id}`,
                            `#${finalRecordId}`
                        );
                        await doc.ref.update({
                            punishment_history: updatedHistory
                        });
                    }
                }
                
                usedIds.add(finalRecordId);
                
                // Prepare punishment document
                punishmentsToCreate.push({
                    id: finalRecordId.toString(),
                    data: {
                        punishment_record_id: finalRecordId,
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
                    }
                });
            }
        }
        
        // Step 3: Create/update punishments collection
        console.log('\n\n📝 Creating/updating punishments collection...');
        
        const batch = db.batch();
        let batchCount = 0;
        
        for (const punishment of punishmentsToCreate) {
            const docRef = db.collection('punishments').doc(punishment.id);
            batch.set(docRef, punishment.data, { merge: true });
            batchCount++;
            
            // Firestore has a limit of 500 operations per batch
            if (batchCount === 500) {
                await batch.commit();
                console.log(`Committed batch of 500 punishments...`);
                batchCount = 0;
            }
        }
        
        // Commit remaining
        if (batchCount > 0) {
            await batch.commit();
            console.log(`Committed final batch of ${batchCount} punishments`);
        }
        
        console.log(`\n✅ Successfully created/updated ${punishmentsToCreate.length} punishment records`);
        
        // Step 4: Verify no duplicates remain
        console.log('\n🔍 Verifying uniqueness...');
        const punishmentsSnapshot = await db.collection('punishments').get();
        const finalIds = new Set();
        let duplicatesFound = false;
        
        punishmentsSnapshot.forEach(doc => {
            const data = doc.data();
            if (finalIds.has(data.punishment_record_id)) {
                console.log(`❌ Duplicate found: ${data.punishment_record_id}`);
                duplicatesFound = true;
            }
            finalIds.add(data.punishment_record_id);
        });
        
        if (!duplicatesFound) {
            console.log('✅ All punishment IDs are unique!');
        }
        
        console.log(`\n📊 Final Statistics:`);
        console.log(`  Total punishments: ${punishmentsSnapshot.size}`);
        console.log(`  Unique IDs: ${finalIds.size}`);
        console.log('\n✨ Migration complete!');
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    fixDuplicateIds()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { fixDuplicateIds };