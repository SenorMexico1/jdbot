// src/commands/remove.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb } = require('../../config/firebase');
const { doc, getDoc, updateDoc } = require('firebase/firestore');
const { getRobloxId } = require('../utils/roblox');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a user\'s active punishment')
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
        const userDoc = await getDoc(doc(db, 'individuals', robloxId.toString()));
        
        if (!userDoc.exists()) {
            await interaction.editReply(`No punishment records found for user **${username}**.`);
            return;
        }

        const userData = userDoc.data();

        if (userData.is_active === false) {
            await interaction.editReply(`User **${username}** doesn't have an active punishment to remove.`);
            return;
        }

        // Update the record to mark as inactive
        await updateDoc(doc(db, 'individuals', robloxId.toString()), {
            is_active: false,
            removed_on: new Date(),
            removed_by: interaction.user.id
        });

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Punishment Removed')
            .setDescription(`Successfully removed active punishment for **${username}**`)
            .addFields(
                { name: 'Record ID', value: userData.punishment_record_id.toString(), inline: true },
                { name: 'Punishment Type', value: userData.punishment_type, inline: true },
                { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};