// src/commands/get.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb } = require('../../config/firebase');
const { getRobloxId, getRobloxUsername } = require('../utils/roblox');
const { getIndividualByRecordId } = require('../utils/firebase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('get')
        .setDescription('Get punishment information by username or record ID')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Roblox username')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('record_id')
                .setDescription('Punishment record ID')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const db = getDb();
        const username = interaction.options.getString('username');
        const recordId = interaction.options.getInteger('record_id');

        if (!username && !recordId) {
            await interaction.editReply('Please provide either a username or record ID.');
            return;
        }

        let individualData;
        let individualDocId;
        let displayUsername;

        if (recordId) {
            // Find by record ID
            const individual = await getIndividualByRecordId(recordId);
            
            if (!individual) {
                await interaction.editReply(`No punishment record found with ID ${recordId}.`);
                return;
            }

            individualData = individual.data;
            individualDocId = individual.id;
            displayUsername = await getRobloxUsername(individualData.roblox_id);
        } else {
            // Find by username
            const robloxId = await getRobloxId(username);
            if (!robloxId) {
                await interaction.editReply('Could not find Roblox user with that username.');
                return;
            }

            const userDoc = await db.collection('individuals').doc(robloxId.toString()).get();
            
            if (!userDoc.exists) {
                await interaction.editReply(`No punishment records found for user **${username}**.`);
                return;
            }

            individualData = userDoc.data();
            individualDocId = userDoc.id;
            displayUsername = username;
        }

        // Check if punishment is inactive/removed
        if (individualData.is_active === false) {
            // Show only basic details for inactive punishments
            const embed = new EmbedBuilder()
                .setColor(0x808080) // Gray color for inactive
                .setTitle(`User Information`)
                .setDescription(`**${displayUsername}**`)
                .addFields(
                    { name: 'Roblox ID', value: individualData.roblox_id.toString(), inline: true },
                    { name: 'Status', value: '❌ No Active Punishment', inline: true },
                    { name: 'Punishment History', value: individualData.punishment_history || 'No history' }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Get tier information for active punishments
        let tierData = null;
        if (individualData.tier_uuid) {
            const tierDoc = await db.collection('punishment_tiers').doc(individualData.tier_uuid.toString()).get();
            tierData = tierDoc.exists ? tierDoc.data() : null;
        }

        // Create embed for active punishments
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`Punishment Record #${individualData.punishment_record_id}`)
            .setDescription(`**${displayUsername}** (Roblox ID: ${individualData.roblox_id})`)
            .addFields(
                { name: 'Current Status', value: '✅ Active', inline: true },
                { name: 'Punishment Type', value: individualData.punishment_type, inline: true }
            );

        if (individualData.punishment_type === 'blacklists' && individualData.blacklist_category) {
            embed.addFields({ name: 'Blacklist Category', value: individualData.blacklist_category, inline: true });
        } else if (!['reminders', 'warnings'].includes(individualData.punishment_type)) {
            embed.addFields({ name: 'Current Tier', value: individualData.current_tier?.toString() || 'N/A', inline: true });
        }

        // Add duration info
        if (tierData) {
            const duration = tierData.length === -1 ? 'Permanent' : tierData.length === null ? 'N/A' : `${tierData.length} days`;
            embed.addFields({ name: 'Duration', value: duration, inline: true });
            
            if (individualData.punishment_end_date && tierData.length > 0) {
                const endDate = individualData.punishment_end_date.toDate ? individualData.punishment_end_date.toDate() : new Date(individualData.punishment_end_date);
                const isExpired = endDate < new Date();
                embed.addFields({ 
                    name: 'Expires', 
                    value: `${endDate.toLocaleDateString()} ${isExpired ? '(EXPIRED)' : ''}`, 
                    inline: true 
                });
            }
        }

        const createdDate = individualData.created_on.toDate ? individualData.created_on.toDate() : new Date(individualData.created_on);
        embed.addFields(
            { name: 'Created On', value: createdDate.toLocaleDateString(), inline: true },
            { name: 'Latest Reason', value: individualData.reason },
            { name: 'Latest Evidence', value: individualData.evidence || 'No evidence provided' },
            { name: 'Punishment History', value: individualData.punishment_history || 'No history' }
        )
        .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};