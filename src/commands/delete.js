// src/commands/delete.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb, getAdmin } = require('../../config/firebase');
const { getRobloxUsername, getRobloxAvatar } = require('../utils/roblox');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete a specific punishment record by ID without adding to history')
        .addIntegerOption(option =>
            option.setName('record_id')
                .setDescription('Punishment record ID to delete')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const db = getDb();
        const admin = getAdmin();
        const recordId = interaction.options.getInteger('record_id');
        
        try {
            // First, check the punishments collection
            const punishmentRef = db.collection('punishments').doc(recordId.toString());
            const punishmentDoc = await punishmentRef.get();
            
            if (!punishmentDoc.exists) {
                await interaction.editReply(`No punishment record found with ID **#${recordId}**.`);
                return;
            }
            
            const punishmentData = punishmentDoc.data();
            const robloxId = punishmentData.roblox_id;
            
            // Get username and avatar
            const username = await getRobloxUsername(robloxId);
            const avatarUrl = await getRobloxAvatar(robloxId);
            
            // Get tier information if applicable
            let tierData = null;
            if (punishmentData.tier_uuid) {
                const tierDoc = await db.collection('punishment_tiers').doc(punishmentData.tier_uuid.toString()).get();
                tierData = tierDoc.exists ? tierDoc.data() : null;
            }
            
            // Delete from punishments collection
            await punishmentRef.delete();
            console.log(`Deleted punishment #${recordId} from punishments collection`);
            
            // Now handle the individuals collection
            const individualRef = db.collection('individuals').doc(robloxId.toString());
            const individualDoc = await individualRef.get();
            
            if (individualDoc.exists) {
                const individualData = individualDoc.data();
                
                // Remove this specific punishment from history
                if (individualData.punishment_history) {
                    const historyLines = individualData.punishment_history.split('\n');
                    const filteredHistory = historyLines.filter(line => !line.includes(`#${recordId}`));
                    
                    // Update the individual document
                    if (individualData.punishment_record_id === recordId) {
                        // This was the current punishment, need to check if there are others
                        const otherPunishmentsSnapshot = await db.collection('punishments')
                            .where('roblox_id', '==', robloxId)
                            .where('is_active', '==', true)
                            .orderBy('created_on', 'desc')
                            .limit(1)
                            .get();
                        
                        if (otherPunishmentsSnapshot.empty) {
                            // No other active punishments, delete the individual record
                            await individualRef.delete();
                            console.log(`Deleted user ${robloxId} from individuals collection (no remaining punishments)`);
                        } else {
                            // Update with the next most recent punishment
                            const nextPunishment = otherPunishmentsSnapshot.docs[0].data();
                            await individualRef.update({
                                ...nextPunishment,
                                punishment_history: filteredHistory.join('\n')
                            });
                            console.log(`Updated user ${robloxId} with next active punishment #${nextPunishment.punishment_record_id}`);
                        }
                    } else {
                        // Just update the history
                        await individualRef.update({
                            punishment_history: filteredHistory.join('\n')
                        });
                        console.log(`Updated punishment history for user ${robloxId}`);
                    }
                }
            }
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('Punishment Record Deleted')
                .setDescription(`Completely deleted punishment record **#${recordId}**`)
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
                { name: 'Was Active', value: punishmentData.is_active ? '✅ Yes' : '❌ No', inline: true },
                { name: 'Deleted By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Created On', value: createdDate.toLocaleDateString(), inline: true },
                { name: 'Reason', value: punishmentData.reason || 'No reason provided' },
                { name: 'Evidence', value: punishmentData.evidence || 'No evidence provided' }
            );

            embed.addFields({ 
                name: '⚠️ Warning', 
                value: 'This punishment has been permanently deleted from all records and history.' 
            })
            .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
            // Send notification
            const { sendPunishmentNotification } = require('../utils/notifications');
            await sendPunishmentNotification(interaction, 'delete', punishmentData, { username });
            
        } catch (error) {
            console.error('Error in delete command:', error);
            await interaction.editReply(`❌ Error deleting punishment: ${error.message}`);
        }
    }
};