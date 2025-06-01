// src/commands/update.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb, getAdmin } = require('../../config/firebase');
const { getRobloxUsername, getRobloxAvatar } = require('../utils/roblox');
const { sendPunishmentNotification } = require('../utils/notifications');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Update a punishment record')
        .addIntegerOption(option =>
            option.setName('record_id')
                .setDescription('Punishment record ID')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('New reason for the punishment')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('evidence')
                .setDescription('New evidence URL')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('tier')
                .setDescription('New tier (for applicable punishment types)')
                .setRequired(false)
                .setMinValue(1)),

    async execute(interaction) {
        await interaction.deferReply();

        const db = getDb();
        const admin = getAdmin();
        const recordId = interaction.options.getInteger('record_id');
        const newReason = interaction.options.getString('reason');
        const newEvidence = interaction.options.getString('evidence');
        const newTier = interaction.options.getInteger('tier');
        
        try {
            // Get the punishment record
            const punishmentRef = db.collection('punishments').doc(recordId.toString());
            const punishmentDoc = await punishmentRef.get();
            
            if (!punishmentDoc.exists) {
                await interaction.editReply(`No punishment record found with ID **#${recordId}**.`);
                return;
            }
            
            const originalData = punishmentDoc.data();
            const robloxId = originalData.roblox_id;
            const username = await getRobloxUsername(robloxId);
            const avatarUrl = await getRobloxAvatar(robloxId);
            
            // Track changes
            const changes = [];
            const updateData = {
                last_updated: admin.firestore.FieldValue.serverTimestamp(),
                last_updated_by: interaction.user.id
            };
            
            // Update reason
            if (newReason) {
                updateData.reason = newReason;
                changes.push(`Reason: ${originalData.reason || 'None'} → ${newReason}`);
            }
            
            // Update evidence
            if (newEvidence) {
                updateData.evidence = newEvidence;
                changes.push(`Evidence: ${originalData.evidence || 'None'} → ${newEvidence}`);
            }
            
            // Update tier (if applicable)
            if (newTier && !['reminder', 'warning', 'blacklist'].includes(originalData.punishment_type)) {
                // Verify tier exists
                const tierSnapshot = await db.collection('punishment_tiers')
                    .where('type_uuid', '==', originalData.type_uuid || 0)
                    .where('punishment_tier', '==', newTier)
                    .get();
                
                if (tierSnapshot.empty) {
                    await interaction.editReply(`Invalid tier ${newTier} for punishment type ${originalData.punishment_type}.`);
                    return;
                }
                
                const tierData = tierSnapshot.docs[0].data();
                updateData.current_tier = newTier;
                updateData.tier_uuid = tierData.tier_uuid;
                
                // Update end date based on new tier
                if (tierData.length && tierData.length > 0) {
                    const startDate = originalData.punishment_start_date?.toDate ? 
                        originalData.punishment_start_date.toDate() : 
                        new Date(originalData.punishment_start_date);
                    
                    const newEndDate = new Date(startDate);
                    newEndDate.setDate(newEndDate.getDate() + tierData.length);
                    updateData.punishment_end_date = newEndDate;
                }
                
                changes.push(`Tier: ${originalData.current_tier || 'None'} → ${newTier}`);
            }
            
            if (changes.length === 0) {
                await interaction.editReply('❌ No changes specified. Please provide at least one field to update.');
                return;
            }
            
            // Update punishment record
            await punishmentRef.update(updateData);
            
            // Update individuals collection if this is the current punishment
            const individualRef = db.collection('individuals').doc(robloxId.toString());
            const individualDoc = await individualRef.get();
            
            if (individualDoc.exists) {
                const individualData = individualDoc.data();
                if (individualData.punishment_record_id === recordId) {
                    await individualRef.update(updateData);
                }
                
                // Add update to history
                const now = new Date();
                const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
                const updateEntry = `• ${formattedDate} - UPDATED #${recordId} - ${changes.join(', ')}`;
                
                let punishmentHistory = individualData.punishment_history || '';
                if (punishmentHistory) {
                    punishmentHistory += `\n${updateEntry}`;
                } else {
                    punishmentHistory = updateEntry;
                }
                
                await individualRef.update({ punishment_history: punishmentHistory });
            }
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor(0xFFFF00)
                .setTitle('Punishment Updated')
                .setDescription(`Updated punishment record **#${recordId}**`)
                .addFields(
                    { name: 'User', value: `${username} (ID: ${robloxId})`, inline: true },
                    { name: 'Record ID', value: recordId.toString(), inline: true },
                    { name: 'Punishment Type', value: originalData.punishment_type, inline: true },
                    { name: 'Updated By', value: `<@${interaction.user.id}>`, inline: true }
                );

            if (avatarUrl) {
                embed.setThumbnail(avatarUrl);
            }

            // Show changes
            embed.addFields({ 
                name: '📝 Changes Made', 
                value: changes.join('\n') 
            });

            // Show current values
            const updatedData = { ...originalData, ...updateData };
            embed.addFields(
                { name: 'Current Reason', value: updatedData.reason || 'No reason provided' },
                { name: 'Current Evidence', value: updatedData.evidence || 'No evidence provided' }
            );

            if (updatedData.current_tier && !['reminder', 'warning'].includes(updatedData.punishment_type)) {
                embed.addFields({ name: 'Current Tier', value: updatedData.current_tier.toString(), inline: true });
            }

            embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
            // Send notification
            await sendPunishmentNotification(interaction, 'update', updatedData, { 
                username, 
                changes: changes.join('\n') 
            });
            
        } catch (error) {
            console.error('Error in update command:', error);
            await interaction.editReply(`❌ Error updating punishment: ${error.message}`);
        }
    }
};