// src/jobs/checkExpiredPunishments.js
const cron = require('node-cron');
const { getDb } = require('../../config/firebase');
const { getRobloxUsername } = require('../utils/roblox');
const { sendDailyRecap } = require('../utils/notifications');

async function checkExpiredPunishments(client) {
    const db = getDb();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    try {
        // Query for all punishments
        const punishmentsSnapshot = await db.collection('punishments').get();
        
        const expiredPunishments = [];
        let totalActive = 0;
        let issuedToday = 0;
        let removedToday = 0;
        
        for (const doc of punishmentsSnapshot.docs) {
            const data = doc.data();
            
            // Count active punishments
            if (data.is_active) {
                totalActive++;
                
                // Check if punishment has an end date and if it's expired
                if (data.punishment_end_date) {
                    const endDate = data.punishment_end_date.toDate ? 
                        data.punishment_end_date.toDate() : 
                        new Date(data.punishment_end_date);
                    
                    if (endDate < now) {
                        const username = await getRobloxUsername(data.roblox_id);
                        expiredPunishments.push({
                            username: username,
                            robloxId: data.roblox_id,
                            recordId: data.punishment_record_id,
                            type: data.punishment_type,
                            tier: data.current_tier,
                            endDate: endDate.toLocaleDateString()
                        });
                    }
                }
            }
            
            // Count today's actions
            if (data.created_on) {
                const createdDate = data.created_on.toDate ? 
                    data.created_on.toDate() : 
                    new Date(data.created_on);
                
                if (createdDate >= today && createdDate < now) {
                    issuedToday++;
                }
            }
            
            if (data.removed_on) {
                const removedDate = data.removed_on.toDate ? 
                    data.removed_on.toDate() : 
                    new Date(data.removed_on);
                
                if (removedDate >= today && removedDate < now) {
                    removedToday++;
                }
            }
        }
        
        // Send daily recap to all configured channels
        const stats = {
            totalActive,
            issuedToday,
            removedToday
        };
        
        await sendDailyRecap(client, expiredPunishments, stats);
        
        console.log(`Daily recap sent: ${totalActive} active, ${expiredPunishments.length} expired`);
        return expiredPunishments;
        
    } catch (error) {
        console.error('Error checking expired punishments:', error);
        return [];
    }
}

function scheduleJobs(client) {
    // Schedule for 6 AM EST daily
    cron.schedule('0 6 * * *', async () => {
        console.log('Running daily punishment recap...');
        try {
            const expired = await checkExpiredPunishments(client);
            console.log(`Daily recap complete. Found ${expired.length} expired punishments`);
        } catch (error) {
            console.error('Error running daily recap:', error);
        }
    }, {
        timezone: "America/New_York"
    });
    
    console.log('Daily recap scheduled for 6 AM EST');
}

module.exports = { scheduleJobs, checkExpiredPunishments };