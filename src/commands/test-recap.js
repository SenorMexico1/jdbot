// src/commands/test-recap.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkExpiredPunishments } = require('../jobs/checkExpiredPunishments');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-recap')
        .setDescription('Manually trigger the daily punishment recap')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            console.log('Manually triggering daily recap...');
            const expired = await checkExpiredPunishments(interaction.client);
            
            await interaction.editReply({
                content: `✅ Daily recap sent! Found ${expired.length} expired punishments.\n\nCheck your configured notification channel.`
            });
        } catch (error) {
            console.error('Error running test recap:', error);
            await interaction.editReply({
                content: `❌ Error running recap: ${error.message}`
            });
        }
    }
};