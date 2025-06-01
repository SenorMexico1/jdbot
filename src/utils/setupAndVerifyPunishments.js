// src/utils/setupAndVerifyPunishments.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

async function setupAndVerifyPunishments() {
    console.log('🔧 Setting up and verifying punishments system...\n');
    
    // Initialize Firebase
    const { initializeFirebase, getDb } = require('../../config/firebase');
    await initializeFirebase();
    
    const db = getDb();
    
    try {
        // Step 1: Check current state
        console.log('📊 Checking current database state...\n');
        
        const individualsSnapshot = await db.collection('individuals').get();
        console.log(`Found ${individualsSnapshot.size} users in individuals collection`);
        
        let punishmentsSnapshot;
        try {
            punishmentsSnapshot = await db.collection('punishments').get();
            console.log(`Found ${punishmentsSnapshot.size} records in punishments collection\n`);
        } catch (error) {
            console.log('Punishments collection does not exist yet\n');
            punishmentsSnapshot = { empty: true, size: 0 };
        }
        
        // Step 2: Analyze and fix issues
        const usedIds = new Set();
        const duplicateIds = new Set();
        const punishmentsToCreate = [];
        
        // First pass: identify all IDs and duplicates
        const allRecords = new Map();
        
        individualsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.punishment_record_id) {
                const key = `${data.roblox_id}-${data.punishment_record_id}`;
                if (allRecords.has(key)) {
                    duplicateIds.add(data.punishment_record_id);
                } else {
                    allRecords.set(key, { ...data, docId: doc.id, source: 'individuals' });
                }
                usedIds.add(data.punishment_record_id);
            }
        });
        
        console.log(`\n🔍 Analysis Results:`);
        console.log(`- Total unique IDs: ${usedIds.size}`);
        console.log(`- Duplicate IDs found: ${duplicateIds.size}`);
        if (duplicateIds.size > 0) {
            console.log(`- Duplicate IDs: ${Array.from(duplicateIds).join(', ')}`);
        }
        
        // Step 3: Generate new IDs for duplicates
        console.log('\n🔧 Fixing duplicates and creating punishments records...\n');
        
        const idMap = new Map(); // Maps old IDs to new IDs
        const newIds = new Set(usedIds);
        
        // Generate new IDs for duplicates
        for (const [key, record] of allRecords) {
            if (duplicateIds.has(record.punishment_record_id)) {
                // Generate new unique ID
                let newId;
                do {
                    newId = 100000 + Math.floor(Math.random() * 900000);
                } while (newIds.has(newId));
                
                newIds.add(newId);
                idMap.set(`${record.docId}-${record.punishment_record_id}`, newId);
                console.log(`📝 Reassigning duplicate ID ${record.punishment_record_id} → ${newId} for user ${record.docId}`);
                
                // Update the record with new ID
                record.punishment_record_id = newId;
            }
        }
        
        // Step 4: Update individuals collection and create punishments
        const batch = db.batch();
        let batchCount = 0;
        
        for (const [key, record] of allRecords) {
            const newId = idMap.get(`${record.docId}-${record.punishment_record_id}`) || record.punishment_record_id;
            
            // Update individuals collection if ID changed
            if (newId !== record.punishment_record_id) {
                const individualRef = db.collection('individuals').doc(record.docId);
                batch.update(individualRef, { punishment_record_id: newId });
                batchCount++;
            }
            
            // Create/update punishment record
            const punishmentRef = db.collection('punishments').doc(newId.toString());
            const punishmentData = {
                punishment_record_id: newId,
                roblox_id: parseInt(record.roblox_id) || parseInt(record.docId), // Ensure it's a number
                punishment_type: record.punishment_type,
                current_tier: record.current_tier || null,
                tier_uuid: record.tier_uuid || null,
                blacklist_category: record.blacklist_category || null,
                reason: record.reason || 'No reason provided',
                evidence: record.evidence || 'No evidence provided',
                created_on: record.created_on,
                punishment_start_date: record.punishment_start_date || record.created_on,
                punishment_end_date: record.punishment_end_date || null,
                is_active: record.is_active !== false,
                removed_on: record.removed_on || null,
                removed_by: record.removed_by || null
            };
            
            batch.set(punishmentRef, punishmentData, { merge: true });
            batchCount++;
            
            // Commit batch if reaching limit
            if (batchCount >= 400) {
                await batch.commit();
                console.log(`Committed batch of ${batchCount} operations...`);
                batchCount = 0;
            }
        }
        
        // Commit remaining operations
        if (batchCount > 0) {
            await batch.commit();
            console.log(`Committed final batch of ${batchCount} operations`);
        }
        
        // Step 5: Verify the results
        console.log('\n✅ Verification...\n');
        
        const finalPunishmentsSnapshot = await db.collection('punishments').get();
        const finalIds = new Set();
        const typeCount = {};
        
        finalPunishmentsSnapshot.forEach(doc => {
            const data = doc.data();
            finalIds.add(data.punishment_record_id);
            typeCount[data.punishment_type] = (typeCount[data.punishment_type] || 0) + 1;
        });
        
        console.log(`📊 Final Statistics:`);
        console.log(`- Total punishment records: ${finalPunishmentsSnapshot.size}`);
        console.log(`- All IDs unique: ${finalIds.size === finalPunishmentsSnapshot.size ? '✅ Yes' : '❌ No'}`);
        console.log(`\nPunishment types breakdown:`);
        for (const [type, count] of Object.entries(typeCount)) {
            console.log(`  - ${type}: ${count}`);
        }
        
        // Step 6: Test queries
        console.log('\n🧪 Testing queries...\n');
        
        // Pick a user with punishments to test
        if (finalPunishmentsSnapshot.size > 0) {
            const testDoc = finalPunishmentsSnapshot.docs[0];
            const testData = testDoc.data();
            const testRobloxId = testData.roblox_id;
            
            console.log(`Testing queries for user ${testRobloxId}...`);
            
            // Test number query
            const numberQuery = await db.collection('punishments')
                .where('roblox_id', '==', testRobloxId)
                .get();
            console.log(`- Query with number: ${numberQuery.size} results`);
            
            // Test string query
            const stringQuery = await db.collection('punishments')
                .where('roblox_id', '==', testRobloxId.toString())
                .get();
            console.log(`- Query with string: ${stringQuery.size} results`);
            
            // Test active query
            const activeQuery = await db.collection('punishments')
                .where('roblox_id', '==', testRobloxId)
                .where('is_active', '==', true)
                .get();
            console.log(`- Active punishments: ${activeQuery.size} results`);
        }
        
        console.log('\n✨ Setup and verification complete!');
        console.log('\n💡 Next steps:');
        console.log('1. Test the /issue command to create new punishments');
        console.log('2. Use /debug-punishments to inspect user data');
        console.log('3. Use /get to see the formatted punishment info');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    setupAndVerifyPunishments()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { setupAndVerifyPunishments };