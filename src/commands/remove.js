// src/commands/delete.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb } = require('../../config/firebase');
const { getRobloxId, getRobloxAvatar } = require('../utils/roblox');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete a user\'s punishment record without adding to history')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Roblox username')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const db = getDb();
        const username = interaction.options.getString('username');
        
        // Get Roblox ID
        const robloxId = await getRobloxId(username);
        if (!robloxId) {
            await interaction.editReply('Could not find Roblox user with that username.');
            return;
        }

        // Get user data
        const userRef = db.collection('individuals').doc(robloxId.toString());
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            await interaction.editReply(`No punishment records found for user **${username}**.`);
            return;
        }

        const userData = userDoc.data();
        const recordId = userData.punishment_record_id;

        // Get tier information if applicable
        let tierData = null;
        if (userData.tier_uuid) {
            const tierDoc = await db.collection('punishment_tiers').doc(userData.tier_uuid.toString()).get();
            tierData = tierDoc.exists ? tierDoc.data() : null;
        }

        // Delete the document entirely from both collections
        await userRef.delete();

        // Also delete from punishments collection if it exists
        if (recordId) {
            try {
                await db.collection('punishments').doc(recordId.toString()).delete();
            } catch (error) {
                console.log('Punishments collection deletion skipped:', error.message);
            }
        }

        // Get avatar URL
        const avatarUrl = await getRobloxAvatar(robloxId);

        const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('Punishment Record Deleted')
            .setDescription(`Completely deleted punishment record for **${username}**`)
            .addFields(
                { name: 'Record ID', value: recordId.toString(), inline: true },
                { name: 'Roblox ID', value: robloxId.toString(), inline: true },
                { name: 'Punishment Type', value: userData.punishment_type, inline: true }
            );

        if (avatarUrl) {
            embed.setThumbnail(avatarUrl);
        }

        // Add tier/category info
        if (userData.punishment_type === 'blacklists' && userData.blacklist_category) {
            embed.addFields({ name: 'Category', value: userData.blacklist_category, inline: true });
        } else if (!['reminders', 'warnings'].includes(userData.punishment_type) && userData.current_tier) {
            embed.addFields({ name: 'Tier', value: userData.current_tier.toString(), inline: true });
        }

        // Add duration
        if (tierData) {
            const duration = tierData.length === -1 ? 'Permanent' : tierData.length === null ? 'N/A' : `${tierData.length} days`;
            embed.addFields({ name: 'Duration', value: duration, inline: true });
        }

        const createdDate = userData.created_on.toDate ? userData.created_on.toDate() : new Date(userData.created_on);
        embed.addFields(
            { name: 'Deleted By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Reason', value: userData.reason || 'No reason provided' },
            { name: 'Evidence', value: userData.evidence || 'No evidence provided' },
            { name: 'Created On', value: createdDate.toLocaleDateString(), inline: true }
        );

        if (userData.punishment_history) {
            embed.addFields({ name: 'Punishment History', value: userData.punishment_history });
        }

        embed.addFields({ name: '⚠️ Warning', value: 'This action cannot be undone. All data for this punishment record has been permanently deleted.' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};