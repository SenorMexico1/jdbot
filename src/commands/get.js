// src/commands/get.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb } = require('../../config/firebase');
const { getRobloxId, getRobloxUsername, getRobloxAvatar } = require('../utils/roblox');
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
        let username = interaction.options.getString('username');
        const recordId = interaction.options.getInteger('record_id');

        if (!username && !recordId) {
            await interaction.editReply('Please provide either a username or record ID.');
            return;
        }

        let individualData;
        let individualDocId;
        let displayUsername;

        try {
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
                    await interaction.editReply('❌ Could not find Roblox user with that username.');
                    return;
                }
                username = await getRobloxUsername(robloxId);
                const userDoc = await db.collection('individuals').doc(robloxId.toString()).get();
                
                if (!userDoc.exists) {
                    // Check if user has any punishment records (for future multi-record support)
                    try {
                        const punishmentsSnapshot = await db.collection('punishments')
                            .where('roblox_id', '==', robloxId)
                            .where('is_active', '==', true)
                            .orderBy('created_on', 'desc')
                            .limit(1)
                            .get();
                        
                        if (punishmentsSnapshot.empty) {
                            // User exists in Roblox but has no punishments
                            const avatarUrl = await getRobloxAvatar(robloxId);
                            
                            const embed = new EmbedBuilder()
                                .setColor(0x00FF00) // Green for clean record
                                .setTitle(`User Information`)
                                .setDescription(`**${username}**`)
                                .addFields(
                                    { name: 'Roblox ID', value: robloxId.toString(), inline: true },
                                    { name: 'Status', value: '✅ None', inline: true },
                                    { name: 'Record', value: 'No punishments found', inline: false }
                                )
                                .setTimestamp();

                            if (avatarUrl) {
                                embed.setThumbnail(avatarUrl);
                            }

                            await interaction.editReply({ embeds: [embed] });
                            return;
                        }
                        
                        // Use the most recent punishment
                        individualData = punishmentsSnapshot.docs[0].data();
                        individualDocId = punishmentsSnapshot.docs[0].id;
                    } catch (error) {
                        // Punishments collection doesn't exist, user has no records
                        const avatarUrl = await getRobloxAvatar(robloxId);
                        
                        const embed = new EmbedBuilder()
                            .setColor(0x00FF00) // Green for clean record
                            .setTitle(`User Information`)
                            .setDescription(`**${username}**`)
                            .addFields(
                                { name: 'Roblox ID', value: robloxId.toString(), inline: true },
                                { name: 'Status', value: '✅ No Punishment Records', inline: true },
                                { name: 'Record', value: 'Clean - No punishments found', inline: false }
                            )
                            .setTimestamp();

                        if (avatarUrl) {
                            embed.setThumbnail(avatarUrl);
                        }

                        await interaction.editReply({ embeds: [embed] });
                        return;
                    }
                } else {
                    individualData = userDoc.data();
                    individualDocId = userDoc.id;
                }
                
                displayUsername = username;
            }

            // Check if punishment is inactive/removed
            if (individualData.is_active === false) {
                // Get avatar URL
                const avatarUrl = await getRobloxAvatar(individualData.roblox_id);
                
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

                if (avatarUrl) {
                    embed.setThumbnail(avatarUrl);
                }

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Get tier information for active punishments
            let tierData = null;
            if (individualData.tier_uuid) {
                const tierDoc = await db.collection('punishment_tiers').doc(individualData.tier_uuid.toString()).get();
                tierData = tierDoc.exists ? tierDoc.data() : null;
            }

            // Get avatar URL
            const avatarUrl = await getRobloxAvatar(individualData.roblox_id);
            const punishmentFormatted = individualData.punishment_type ? individualData.punishment_type.charAt(0).toUpperCase() + individualData.punishment_type.slice(1) : 'Punished'
            // Create embed for active punishments
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`Punishment Record #${individualData.punishment_record_id}`)
                .setDescription(`**${displayUsername}** (Roblox ID: ${individualData.roblox_id})`)
                .addFields(
                    { name: 'Current Status', value: '✅ Active', inline: true },
                    { name: 'Punishment', value: punishmentFormatted, inline: true }
                );

            if (avatarUrl) {
                embed.setThumbnail(avatarUrl);
            }

            if (individualData.punishment_type === 'blacklist' && individualData.blacklist_category) {
                embed.addFields({ name: 'Blacklist Category', value: individualData.blacklist_category, inline: true });
            } else if (!['reminder', 'warning'].includes(individualData.punishment_type)) {
                embed.addFields({ name: 'Tier', value: individualData.current_tier?.toString() || 'N/A', inline: true });
            }

            const createdDate = individualData.created_on.toDate ? individualData.created_on.toDate() : new Date(individualData.created_on);
            embed.addFields(
                { name: 'Date Issued', value: createdDate.toLocaleDateString(), inline: true });
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
            embed.addFields(    
                { name: 'Latest Reason', value: individualData.reason || 'No reason provided' },
                { name: 'Latest Evidence', value: individualData.evidence || 'No evidence provided' }
            );

            // Check for other active punishments (when using the new punishments collection)
            try {
                // Ensure roblox_id is a number for consistent querying
                const robloxIdNum = typeof individualData.roblox_id === 'string' 
                    ? parseInt(individualData.roblox_id) 
                    : individualData.roblox_id;
                
                // Debug: Check if punishments collection exists and query it
                console.log(`Querying punishments for robloxId: ${robloxIdNum} (type: ${typeof robloxIdNum})`);
                console.log(`Current punishment record ID: ${individualData.punishment_record_id}`);
                    
                const otherPunishmentsSnapshot = await db.collection('punishments')
                    .where('roblox_id', '==', robloxIdNum)
                    .where('is_active', '==', true)
                    .get();
                
                console.log(`Found ${otherPunishmentsSnapshot.size} total active punishments`);
                
                // Filter out the current punishment
                const otherPunishments = [];
                otherPunishmentsSnapshot.forEach(doc => {
                    const data = doc.data();
                    console.log(`Checking punishment #${data.punishment_record_id}: ${data.punishment_type}`);
                    if (data.punishment_record_id !== individualData.punishment_record_id) {
                        otherPunishments.push(data);
                    }
                });
                
                console.log(`Found ${otherPunishments.length} other active punishments`);
                
                if (otherPunishments.length > 0) {
                    let otherPunishmentsText = '';
                    
                    for (const punishment of otherPunishments) {
                        let entry = `• **#${punishment.punishment_record_id}** - ${punishment.punishment_type}`;
                        
                        if (punishment.current_tier) {
                            entry += ` (Tier ${punishment.current_tier})`;
                        } else if (punishment.blacklist_category) {
                            entry += ` (${punishment.blacklist_category})`;
                        }
                        
                        const reasonText = punishment.reason || 'No reason provided';
                        const reasonPreview = reasonText.length > 50 
                            ? reasonText.substring(0, 47) + '...' 
                            : reasonText;
                        
                        entry += `\n  └─ ${reasonPreview}`;
                        
                        if (reasonText.length > 50) {
                            entry += `\n     *Use \`/get record_id:${punishment.punishment_record_id}\` for full details*`;
                        }
                        
                        otherPunishmentsText += entry + '\n';
                    }
                    
                    embed.addFields({ 
                        name: '📋 Other Active Punishments', 
                        value: otherPunishmentsText.trim() || 'None' 
                    });
                }
            } catch (error) {
                // If punishments collection doesn't exist yet, skip this section
                console.log('Punishments collection not found, skipping other active punishments');
            }

            // Process punishment history to exclude current active punishment
            if (individualData.punishment_history) {
                const historyLines = individualData.punishment_history.split('\n');
                const filteredHistory = [];
                
                // Get current punishment date and type for comparison
                const currentDate = createdDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
                const currentType = individualData.punishment_type.charAt(0).toUpperCase() + individualData.punishment_type.slice(1);
                
                // Build a string to match current punishment in history
                let currentIdentifier = `${currentDate} - `;
                if (individualData.punishment_type === 'blacklist' && individualData.blacklist_category) {
                    currentIdentifier += `Blacklist (${individualData.blacklist_category})`;
                } else if (individualData.current_tier && !['reminder', 'warning'].includes(individualData.punishment_type)) {
                    currentIdentifier += `Tier ${individualData.current_tier} ${currentType}`;
                } else {
                    currentIdentifier += currentType;
                }
                
                // Filter out the current active punishment from history
                for (const line of historyLines) {
                    if (!line.includes(currentIdentifier)) {
                        filteredHistory.push(line);
                    }
                }
                
                const finalHistory = filteredHistory.length > 0 
                    ? filteredHistory.join('\n') 
                    : 'No previous punishments';
                const fmt = '```'
                embed.addFields({ 
                    name: 'Punishment History', 
                    value: `${fmt}${finalHistory}${fmt}`
                });
            } else {
                embed.addFields({ 
                    name: 'Punishment History', 
                    value: 'No previous punishments'
                });
            }

            embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in get command:', error);
            await interaction.editReply('❌ An error occurred while fetching punishment information. Please try again.');
        }
    }
};