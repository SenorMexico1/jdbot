const { EmbedBuilder } = require('discord.js');

function createPunishmentEmbed(title, description, color = 0x0099FF) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

function createErrorEmbed(message) {
    return new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Error')
        .setDescription(message)
        .setTimestamp();
}

module.exports = {
    createPunishmentEmbed,
    createErrorEmbed
};