// src/commands/test-types.js (temporary debug command)
const { SlashCommandBuilder } = require('discord.js');
const { getDb } = require('../../config/firebase');
const { getPunishmentTypes } = require('../utils/punishmentTypes');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-types')
        .setDescription('Test punishment types loading'),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        try {
            const db = getDb();
            
            // Test direct database access
            const snapshot = await db.collection('punishment_types').get();
            const dbTypes = [];
            snapshot.forEach(doc => {
                dbTypes.push(`${doc.data().punishment_type} (${doc.data().type_uuid})`);
            });
            
            // Test cached access
            const cachedTypes = await getPunishmentTypes();
            
            await interaction.editReply({
                content: `**Database Types:** ${dbTypes.join(', ')}\n**Cached Types:** ${JSON.stringify(cachedTypes)}`
            });
        } catch (error) {
            await interaction.editReply(`Error: ${error.message}`);
        }
    }
};