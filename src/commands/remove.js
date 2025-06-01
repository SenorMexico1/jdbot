// src/commands/remove.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb, getAdmin } = require('../../config/firebase');
const { getRobloxUsername, getRobloxAvatar } = require('../utils/roblox');
const { sendPunishmentNotification } = require('../utils/notifications');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a punishment (marks as inactive but keeps in history)')
        .addIntegerOption(option =>
            option.setName('record_id')
                .setDescription('Punishment record ID')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for removal')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const db = getDb();
        const admin = getAdmin();
        const recordId = interaction.options.getInteger('record_id');
        const removalReason = interaction.options.getString('reason') || 'No reason provided';
        
        try {
            // Get the punishment record
            const punishmentRef = db.collection('punishments').doc(recordId.toString());
            const punishmentDoc = await punishmentRef.get();
            
            if (!punishmentDoc.exists) {
                await interaction.editReply(`No punishment record found with ID **#${recordId}**.`);
                return;
            }
            
            const punishmentData = punishmentDoc.data();
            
            // Check if already inactive
            if (!punishmentData.is_active) {
                await interaction.editReply(`Punishment **#${recordId}** is already inactive.`);
                return;
            }
            
            const robloxId = punishmentData.roblox_id;
            const username = await getRobloxUsername(robloxId);
            const avatarUrl = await getRobloxAvatar(robloxId);
            
            // Update punishment record to inactive
            await punishmentRef.update({
                is_active: false,
                removed_on: admin.firestore.FieldValue.serverTimestamp(),
                removed_by: interaction.user.id,
                removal_reason: removalReason
            });
            
            // Update punishment history
            const individualRef = db.collection('individuals').doc(robloxId.toString());
            const individualDoc = await individualRef.get();
            
            if (individualDoc.exists) {
                const individualData = individualDoc.data();
                const now = new Date();
                const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
                
                // Add removal to history
                let punishmentHistory = individualData.punishment_history || '';
                const removalEntry = `• ${formattedDate} - REMOVED #${recordId} - ${removalReason}`;
                
                if (punishmentHistory) {
                    punishmentHistory += `\n${removalEntry}`;
                } else {
                    punishmentHistory = removalEntry;
                }
                
                // If this was the current active punishment, find the next one
                if (individualData.punishment_record_id === recordId) {
                    const nextActiveSnapshot = await db.collection('punishments')
                        .where('roblox_id', '==', robloxId)
                        .where('is_active', '==', true)
                        .orderBy('created_on', 'desc')
                        .limit(1)
                        .get();
                    
                    if (nextActiveSnapshot.empty) {
                        // No more active punishments, mark user as clean
                        await individualRef.update({
                            is_active: false,
                            punishment_history: punishmentHistory,
                            removed_on: admin.firestore.FieldValue.serverTimestamp(),
                            removed_by: interaction.user.id
                        });
                    } else {
                        // Update with next active punishment
                        const nextPunishment = nextActiveSnapshot.docs[0].data();
                        await individualRef.update({
                            ...nextPunishment,
                            punishment_history: punishmentHistory
                        });
                    }
                } else {
                    // Just update the history
                    await individualRef.update({
                        punishment_history: punishmentHistory
                    });
                }
            }
            
            // Get tier information if applicable
            let tierData = null;
            if (punishmentData.tier_uuid) {
                const tierDoc = await db.collection('punishment_tiers').doc(punishmentData.tier_uuid.toString()).get();
                tierData = tierDoc.exists ? tierDoc.data() : null;
            }
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('Punishment Removed')
                .setDescription(`Punishment **#${recordId}** has been marked as inactive`)
                .addFields(
                    { name: 'User', value: `${username} (ID: ${robloxId})`, inline: true },
                    { name: 'Record ID', value: recordId.toString(), inline: true },
                    { name: 'Punishment Type', value: punishmentData.punishment_type, inline: true }
                );

            if (avatarUrl) {
                embed.setThumbnail(avatarUrl);
            }

            // Add tier/category info
            if (punishmentData.punishment_type === 'blacklist' && punishmentData.blacklist_category) {
                embed.addFields({ name: 'Category', value: punishmentData.blacklist_category, inline: true });
            } else if (!['reminder', 'warning'].includes(punishmentData.punishment_type) && punishmentData.current_tier) {
                embed.addFields({ name: 'Tier', value: punishmentData.current_tier.toString(), inline: true });
            }

            // Add duration
            if (tierData) {
                const duration = tierData.length === -1 ? 'Permanent' : tierData.length === null ? 'N/A' : `${tierData.length} days`;
                embed.addFields({ name: 'Duration', value: duration, inline: true });
            }

            const createdDate = punishmentData.created_on?.toDate ? punishmentData.created_on.toDate() : new Date(punishmentData.created_on);
            embed.addFields(
                { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Created On', value: createdDate.toLocaleDateString(), inline: true },
                { name: 'Original Reason', value: punishmentData.reason || 'No reason provided' },
                { name: 'Removal Reason', value: removalReason }
            );

            embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
            // Send notification
            await sendPunishmentNotification(interaction, 'remove', punishmentData, { 
                username, 
                removalReason 
            });
            
        } catch (error) {
            console.error('Error in remove command:', error);
            await interaction.editReply(`❌ Error removing punishment: ${error.message}`);
        }
    }
};