// src/utils/notifications.js
const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../config/firebase');

async function getNotificationChannel(client, guildId) {
    const db = getDb();
    const settingsDoc = await db.collection('guild_settings').doc(guildId).get();
    
    if (!settingsDoc.exists) {
        return null;
    }
    
    const settings = settingsDoc.data();
    if (!settings.notifications_enabled || !settings.notification_channel_id) {
        return null;
    }
    
    try {
        const channel = await client.channels.fetch(settings.notification_channel_id);
        return channel;
    } catch (error) {
        console.error('Failed to fetch notification channel:', error);
        return null;
    }
}

async function sendPunishmentNotification(interaction, action, punishmentData, userData = {}) {
    const channel = await getNotificationChannel(interaction.client, interaction.guild.id);
    if (!channel) return;
    
    const colors = {
        issue: 0xFF0000,      // Red
        remove: 0x00FF00,     // Green
        delete: 0xFF6B6B,     // Light Red
        update: 0xFFFF00,     // Yellow
        expire: 0xFFA500      // Orange
    };
    
    // Capitalize punishment type
    const capitalizedType = punishmentData.punishment_type.charAt(0).toUpperCase() + punishmentData.punishment_type.slice(1);
    
    // Generate action-specific titles
    const actionTitles = {
        issue: `${capitalizedType} Issued`,
        remove: `${capitalizedType} Removed`,
        delete: `${capitalizedType} Deleted`,
        update: `${capitalizedType} Updated`,
        expire: `${capitalizedType} Expired`
    };
    
    const embed = new EmbedBuilder()
        .setColor(colors[action] || 0x0099FF)
        .setTitle(`📋 ${actionTitles[action] || 'Punishment Action'}`)
        .setDescription(`Action performed by <@${interaction.user.id}> (${interaction.user.username})`)
        .addFields(
            { name: 'User', value: `${userData.username || 'Unknown'} (ID: ${punishmentData.roblox_id})`, inline: true },
            { name: 'Record ID', value: `#${punishmentData.punishment_record_id}`, inline: true },
            { name: 'Type', value: capitalizedType, inline: true }
        );
    
    // Add tier as a separate field if applicable
    if (punishmentData.current_tier && !['reminder', 'warning'].includes(punishmentData.punishment_type)) {
        embed.addFields({ name: 'Tier', value: punishmentData.current_tier.toString(), inline: true });
    }
    
    // Add category for blacklists
    if (punishmentData.blacklist_category) {
        embed.addFields({ name: 'Category', value: punishmentData.blacklist_category, inline: true });
    }
    
    // Add reason if available
    if (punishmentData.reason && punishmentData.reason !== 'No reason provided') {
        embed.addFields({ name: 'Reason', value: punishmentData.reason });
    }
    
    // Add action-specific information
    switch (action) {
        case 'issue':
            if (punishmentData.punishment_end_date) {
                const endDate = punishmentData.punishment_end_date.toDate ? 
                    punishmentData.punishment_end_date.toDate() : 
                    new Date(punishmentData.punishment_end_date);
                embed.addFields({ name: 'Expires', value: endDate.toLocaleDateString(), inline: true });
            }
            break;
        case 'remove':
            embed.addFields({ name: 'Removal Reason', value: userData.removalReason || 'No reason provided' });
            break;
        case 'update':
            if (userData.changes) {
                embed.addFields({ name: 'Changes', value: userData.changes });
            }
            break;
    }
    
    embed.setTimestamp();
    
    try {
        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Failed to send notification:', error);
    }
}

async function sendDailyRecap(client, expiredPunishments, stats = {}) {
    // Get all guild settings
    const db = getDb();
    const settingsSnapshot = await db.collection('guild_settings').get();
    
    for (const doc of settingsSnapshot.docs) {
        const settings = doc.data();
        const guildId = doc.id;
        
        if (!settings.notifications_enabled || !settings.notification_channel_id) {
            continue;
        }
        
        try {
            const channel = await client.channels.fetch(settings.notification_channel_id);
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('📊 Daily Punishment Recap')
                .setDescription(`Report for ${new Date().toLocaleDateString()}`)
                .setTimestamp();
            
            // Add statistics if provided
            if (stats.totalActive !== undefined) {
                embed.addFields({
                    name: '📈 Statistics',
                    value: `Active Punishments: **${stats.totalActive}**\n` +
                           `Issued Today: **${stats.issuedToday || 0}**\n` +
                           `Removed Today: **${stats.removedToday || 0}**\n` +
                           `Expired Today: **${expiredPunishments.length}**`
                });
            }
            
            // Add expired punishments
            if (expiredPunishments.length > 0) {
                let expiredText = '';
                for (const punishment of expiredPunishments.slice(0, 10)) { // Limit to 10
                    const capitalizedType = punishment.type.charAt(0).toUpperCase() + punishment.type.slice(1);
                    expiredText += `• **${punishment.username}** - #${punishment.recordId} (${capitalizedType})\n`;
                }
                
                if (expiredPunishments.length > 10) {
                    expiredText += `\n*... and ${expiredPunishments.length - 10} more*`;
                }
                
                embed.addFields({
                    name: '⏰ Expired Punishments',
                    value: expiredText || 'None'
                });
            } else {
                embed.addFields({
                    name: '⏰ Expired Punishments',
                    value: 'No punishments expired today'
                });
            }
            
            await channel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error(`Failed to send daily recap to guild ${guildId}:`, error);
        }
    }
}

module.exports = {
    getNotificationChannel,
    sendPunishmentNotification,
    sendDailyRecap
};