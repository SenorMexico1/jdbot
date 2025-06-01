// src/commands/debug-punishments.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb } = require('../../config/firebase');
const { getRobloxId } = require('../utils/roblox');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-punishments')
        .setDescription('Debug: Show all punishments for a user')
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

        try {
            // Check individuals collection
            const individualDoc = await db.collection('individuals').doc(robloxId.toString()).get();
            let individualData = null;
            if (individualDoc.exists) {
                individualData = individualDoc.data();
            }

            // Check punishments collection
            const punishmentsSnapshot = await db.collection('punishments')
                .where('roblox_id', '==', robloxId)
                .get();

            const embed = new EmbedBuilder()
                .setColor(0xFFFF00)
                .setTitle('🔍 Debug: Punishment Data')
                .setDescription(`**${username}** (ID: ${robloxId})`);

            // Show individuals collection data
            if (individualData) {
                embed.addFields({
                    name: '📁 Individuals Collection',
                    value: `Record ID: ${individualData.punishment_record_id}\n` +
                           `Type: ${individualData.punishment_type}\n` +
                           `Active: ${individualData.is_active !== false}\n` +
                           `Created: ${individualData.created_on?.toDate ? individualData.created_on.toDate().toLocaleDateString() : 'Unknown'}`
                });
            } else {
                embed.addFields({
                    name: '📁 Individuals Collection',
                    value: 'No data found'
                });
            }

            // Show punishments collection data
            if (!punishmentsSnapshot.empty) {
                let punishmentsText = `Found ${punishmentsSnapshot.size} punishment(s):\n\n`;
                
                punishmentsSnapshot.forEach(doc => {
                    const data = doc.data();
                    punishmentsText += `**Record #${data.punishment_record_id}**\n`;
                    punishmentsText += `• Doc ID: ${doc.id}\n`;
                    punishmentsText += `• Type: ${data.punishment_type}\n`;
                    punishmentsText += `• Active: ${data.is_active}\n`;
                    punishmentsText += `• Roblox ID: ${data.roblox_id} (type: ${typeof data.roblox_id})\n`;
                    punishmentsText += `• Created: ${data.created_on?.toDate ? data.created_on.toDate().toLocaleDateString() : 'Unknown'}\n\n`;
                });

                // Split into multiple fields if too long
                const chunks = punishmentsText.match(/[\s\S]{1,1000}/g) || [];
                chunks.forEach((chunk, index) => {
                    embed.addFields({
                        name: index === 0 ? '📁 Punishments Collection' : 'Continued...',
                        value: chunk
                    });
                });
            } else {
                embed.addFields({
                    name: '📁 Punishments Collection',
                    value: 'No punishments found'
                });
            }

            // Show history
            if (individualData?.punishment_history) {
                embed.addFields({
                    name: '📜 Punishment History',
                    value: individualData.punishment_history.substring(0, 1024)
                });
            }

            embed.setTimestamp();
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Debug error:', error);
            await interaction.editReply(`Error: ${error.message}`);
        }
    }
};