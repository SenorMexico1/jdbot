// src/jobs/checkExpiredPunishments.js
const cron = require('node-cron');
const { getDb } = require('../../config/firebase');
const { getRobloxUsername } = require('../utils/roblox');
const { EmbedBuilder } = require('discord.js');

async function checkExpiredPunishments(client) {
    const db = getDb();
    const now = new Date();
    
    // Query for active punishments
    const snapshot = await db.collection('individuals')
        .where('is_active', '!=', false)
        .get();
    
    const expiredPunishments = [];
    
    for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // Check if punishment has an end date and if it's expired
        if (data.punishment_end_date) {
            const endDate = data.punishment_end_date.toDate ? data.punishment_end_date.toDate() : new Date(data.punishment_end_date);
            
            if (endDate < now) {
                expiredPunishments.push({
                    username: await getRobloxUsername(data.roblox_id),
                    robloxId: data.roblox_id,
                    recordId: data.punishment_record_id,
                    type: data.punishment_type,
                    tier: data.current_tier,
                    endDate: endDate.toLocaleDateString()
                });
            }
        }
    }
    
    // Send notification if there are expired punishments
    if (expiredPunishments.length > 0 && process.env.NOTIFICATION_CHANNEL_ID) {
        const channel = client.channels.cache.get(process.env.NOTIFICATION_CHANNEL_ID);
        if (channel) {
            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('Expired Punishments Report')
                .setDescription(`Found ${expiredPunishments.length} expired punishment(s)`)
                .setTimestamp();
            
            let reportText = '';
            for (const punishment of expiredPunishments) {
                reportText += `• **${punishment.username}** (ID: ${punishment.robloxId})\n`;
                reportText += `  - Record: #${punishment.recordId}\n`;
                reportText += `  - Type: ${punishment.type}${punishment.tier ? ` (Tier ${punishment.tier})` : ''}\n`;
                reportText += `  - Expired: ${punishment.endDate}\n\n`;
            }
            
            // Discord has a field value limit of 1024 characters
            if (reportText.length > 1024) {
                // Split into multiple fields if needed
                const chunks = [];
                let currentChunk = '';
                const lines = reportText.split('\n');
                
                for (const line of lines) {
                    if ((currentChunk + line + '\n').length > 1024) {
                        chunks.push(currentChunk);
                        currentChunk = line + '\n';
                    } else {
                        currentChunk += line + '\n';
                    }
                }
                if (currentChunk) {
                    chunks.push(currentChunk);
                }
                
                chunks.forEach((chunk, index) => {
                    embed.addFields({ 
                        name: chunks.length > 1 ? `Expired Punishments (Part ${index + 1})` : 'Expired Punishments', 
                        value: chunk || 'None' 
                    });
                });
            } else {
                embed.addFields({ name: 'Expired Punishments', value: reportText || 'None' });
            }
            
            await channel.send({ embeds: [embed] });
        }
    }
    
    return expiredPunishments;
}

function scheduleJobs(client) {
    // Schedule for 6 AM EST daily
    cron.schedule('0 6 * * *', async () => {
        console.log('Running expired punishments check...');
        try {
            const expired = await checkExpiredPunishments(client);
            console.log(`Found ${expired.length} expired punishments`);
        } catch (error) {
            console.error('Error checking expired punishments:', error);
        }
    }, {
        timezone: "America/New_York"
    });
    
    console.log('Cron job scheduled for 6 AM EST daily');
}

module.exports = { scheduleJobs, checkExpiredPunishments };