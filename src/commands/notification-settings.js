// src/commands/notification-settings.js
const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { getDb } = require('../../config/firebase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('notification-settings')
        .setDescription('Configure notification settings for punishment actions')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-channel')
                .setDescription('Set the channel for punishment notifications')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to send notifications to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current notification settings'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable punishment notifications')),

    async execute(interaction) {
        await interaction.deferReply();
        
        const db = getDb();
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const settingsRef = db.collection('guild_settings').doc(guildId);

        try {
            switch (subcommand) {
                case 'set-channel': {
                    const channel = interaction.options.getChannel('channel');
                    
                    // Verify bot has permissions in the channel
                    const botPermissions = channel.permissionsFor(interaction.client.user);
                    if (!botPermissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
                        await interaction.editReply('❌ I don\'t have permission to send messages in that channel!');
                        return;
                    }

                    // Save to Firebase
                    await settingsRef.set({
                        notification_channel_id: channel.id,
                        notification_channel_name: channel.name,
                        configured_by: interaction.user.id,
                        configured_at: new Date(),
                        notifications_enabled: true
                    }, { merge: true });

                    // Send test message
                    try {
                        const testEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('✅ Notifications Configured')
                            .setDescription('This channel will now receive punishment action notifications.')
                            .setTimestamp();
                        
                        await channel.send({ embeds: [testEmbed] });
                    } catch (error) {
                        console.error('Failed to send test message:', error);
                    }

                    const embed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('Notification Settings Updated')
                        .setDescription(`Punishment notifications will be sent to ${channel}`)
                        .addFields(
                            { name: 'Channel', value: `${channel}`, inline: true },
                            { name: 'Configured By', value: `<@${interaction.user.id}>`, inline: true }
                        )
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'view': {
                    const settingsDoc = await settingsRef.get();
                    
                    if (!settingsDoc.exists || !settingsDoc.data().notification_channel_id) {
                        await interaction.editReply('❌ No notification channel has been configured.');
                        return;
                    }

                    const settings = settingsDoc.data();
                    const embed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle('Current Notification Settings')
                        .addFields(
                            { name: 'Status', value: settings.notifications_enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                            { name: 'Channel', value: `<#${settings.notification_channel_id}>`, inline: true },
                            { name: 'Configured By', value: `<@${settings.configured_by}>`, inline: true }
                        );

                    if (settings.configured_at) {
                        const date = settings.configured_at.toDate ? settings.configured_at.toDate() : new Date(settings.configured_at);
                        embed.addFields({ name: 'Configured On', value: date.toLocaleDateString(), inline: true });
                    }

                    embed.setTimestamp();
                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'disable': {
                    await settingsRef.set({
                        notifications_enabled: false,
                        disabled_by: interaction.user.id,
                        disabled_at: new Date()
                    }, { merge: true });

                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('Notifications Disabled')
                        .setDescription('Punishment action notifications have been disabled.')
                        .addFields({ name: 'Disabled By', value: `<@${interaction.user.id}>`, inline: true })
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }
            }
        } catch (error) {
            console.error('Error in notification settings:', error);
            await interaction.editReply('❌ An error occurred while updating notification settings.');
        }
    }
};