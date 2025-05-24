// For blacklists, show categories
                if (selectedType === 'blacklists' || selectedType === 'blacklist') {
                    const categories = await getBlacklistCategories();
                    const filtered = Object.keys(categories)
                        .filter(cat => cat.toLowerCase().includes(focusedOption.value.toLowerCase()))
                        .slice(0, 25);
                    
                    await interaction.respond(
                        filtered.map(cat => ({ 
                            name: `Category: ${cat}`, 
                            value: `category:${cat}` 
                        }))
                    );
                } 
                // For suspensions, strikes, demotions - show tiers
                else if (['suspensions', 'suspension', 'strikes', 'strike', 'demotions', 'demotion'].includes(selectedType)) {
                    const tiersSnapshot = await db.collection('punishment_tiers')
                        .where('type_uuid', '==', typeUuid)
                        .get();
                    
                    const tiers = [];
                    tiersSnapshot.forEach(doc => {
                        const data = doc.data();
                        let duration;
                        
                        if (data.length === -1) {
                            duration = 'Permanent';
                        } else if (data.length === null) {
                            duration = 'N/A';
                        } else {
                            // Format duration nicely
                            const days = data.length;
                            if (days % 365 === 0 && days >= 365) {
                                const years = days / 365;
                                duration = years === 1 ? '1 year' : `${years} years`;
                            } else if (days % 30 === 0 && days >= 30) {
                                const months = days / 30;
                                duration = months === 1 ? '1 month' : `${months} months`;
                            } else if (days % 7 === 0 && days >= 7) {
                                const weeks = days / 7;
                                duration = weeks === 1 ? '1 week' : `${weeks} weeks`;
                            } else {
                                duration = days === 1 ? '1 day' : `${days} days`;
                            }
                        }
                        
                        tiers.push({
                            tier: data.punishment_tier,
                            display: `Tier ${data.punishment_tier} (${duration})`
                        });
                    });
                    
                    // Sort by tier number
                    tiers.sort((a, b) => a.tier - b.tier);
                    
                    // Filter based on input
                    const filtered = tiers
                        .filter(t => t.display.toLowerCase().includes(focusedOption.value.toLowerCase()))
                        .slice(0, 25);
                    
                    await interaction.respond(
                        filtered.map(t => ({ 
                            name: t.display, 
                            value: `tier:${t.tier}` 
                        }))
                    );
                } 
                // For// src/commands/issue.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb, getAdmin } = require('../../config/firebase');
const { getRobloxId } = require('../utils/roblox');
const { getPunishmentTypes, getBlacklistCategories, getNextPunishmentId } = require('../utils/punishmentTypes');
const { calculateEndDate } = require('../utils/firebase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('issue')
        .setDescription('Issue a punishment to a user')
        .addStringOption(option => 
            option.setName('username')
                .setDescription('Roblox username')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of punishment')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('tier')
                .setDescription('Tier number (suspensions) or Category (blacklists)')
                .setRequired(false)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for punishment')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('evidence')
                .setDescription('Evidence URL')
                .setRequired(false)),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        
        try {
            if (focusedOption.name === 'type') {
                const punishmentTypes = await getPunishmentTypes();
                const filtered = Object.keys(punishmentTypes)
                    .filter(type => type.startsWith(focusedOption.value.toLowerCase()))
                    .slice(0, 25);
                
                await interaction.respond(
                    filtered.map(type => ({ 
                        name: type.charAt(0).toUpperCase() + type.slice(1), 
                        value: type 
                    }))
                );
            } else if (focusedOption.name === 'tier') {
                const selectedType = interaction.options.getString('type');
                
                if (!selectedType) {
                    await interaction.respond([
                        { name: '⚠️ Please select a punishment type first', value: 'invalid' }
                    ]);
                    return;
                }
                
                const db = getDb();
                const punishmentTypes = await getPunishmentTypes();
                const typeUuid = punishmentTypes[selectedType];
                
                if (!typeUuid) {
                    await interaction.respond([
                        { name: '⚠️ Invalid punishment type', value: 'invalid' }
                    ]);
                    return;
                }
                
                // For blacklists, show categories
                if (selectedType === 'blacklist') {
                    const categories = await getBlacklistCategories();
                    const filtered = Object.keys(categories)
                        .filter(cat => cat.toLowerCase().includes(focusedOption.value.toLowerCase()))
                        .slice(0, 25);
                    
                    await interaction.respond(
                        filtered.map(cat => ({ 
                            name: `Category: ${cat}`, 
                            value: `category:${cat}` 
                        }))
                    );
                } 
                // For suspension, strike, demotion - show tiers
                else if (['suspension', 'strike', 'demotion'].includes(selectedType)) {
                    const tiersSnapshot = await db.collection('punishment_tiers')
                        .where('type_uuid', '==', typeUuid)
                        .get();
                    
                    const tiers = [];
                    tiersSnapshot.forEach(doc => {
                        const data = doc.data();
                        const duration = data.length === -1 ? 'Permanent' : 
                                       data.length === null ? 'N/A' : 
                                       `${data.length} days`;
                        tiers.push({
                            tier: data.punishment_tier,
                            display: `Tier ${data.punishment_tier} (${duration})`
                        });
                    });
                    
                    // Sort by tier number
                    tiers.sort((a, b) => a.tier - b.tier);
                    
                    // Filter based on input
                    const filtered = tiers
                        .filter(t => t.display.toLowerCase().includes(focusedOption.value.toLowerCase()))
                        .slice(0, 25);
                    
                    await interaction.respond(
                        filtered.map(t => ({ 
                            name: t.display, 
                            value: `tier:${t.tier}` 
                        }))
                    );
                } 
                // For reminder and warning
                else {
                    await interaction.respond([
                        { name: 'Not applicable for this punishment type', value: 'none' }
                    ]);
                }
            }
        } catch (error) {
            console.error('Autocomplete error:', error);
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        await interaction.deferReply();

        const db = getDb();
        const admin = getAdmin();
        const username = interaction.options.getString('username');
        const punishmentType = interaction.options.getString('type');
        const tierOrCategory = interaction.options.getString('tier_or_category');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const evidence = interaction.options.getString('evidence') || 'No evidence provided';

        // Parse tier or category
        let tier = null;
        let category = null;
        
        if (tierOrCategory) {
            if (tierOrCategory.startsWith('tier:')) {
                tier = parseInt(tierOrCategory.substring(5));
            } else if (tierOrCategory.startsWith('category:')) {
                category = tierOrCategory.substring(9);
            } else if (tierOrCategory === 'none' || tierOrCategory === 'invalid') {
                // Ignore these special values
            } else {
                await interaction.editReply('❌ Invalid tier/category format.');
                return;
            }
        }

        // Get punishment types
        const punishmentTypes = await getPunishmentTypes();
        
        if (!punishmentTypes[punishmentType]) {
            await interaction.editReply('Invalid punishment type.');
            return;
        }

        // Validate tier/category requirements
        if (punishmentType === 'blacklist' || punishmentType === 'blacklists') {
            if (!category) {
                await interaction.editReply('❌ Blacklist punishments require a category.');
                return;
            }
        } else if (['suspension', 'suspensions', 'strike', 'strikes', 'demotion', 'demotions'].includes(punishmentType)) {
            if (!tier) {
                await interaction.editReply(`❌ ${punishmentType.charAt(0).toUpperCase() + punishmentType.slice(1)} require a tier number.`);
                return;
            }
        }

        // Get Roblox ID
        const robloxId = await getRobloxId(username);
        if (!robloxId) {
            await interaction.editReply('Could not find Roblox user with that username.');
            return;
        }

        // Get punishment type UUID
        const typeUuid = punishmentTypes[punishmentType];

        let tierData;
        let actualTier;

        if (punishmentType === 'blacklist' || punishmentType === 'blacklists') {
            // For blacklists, find the tier based on category
            const categories = await getBlacklistCategories();
            const categoryTier = Object.entries(categories).find(([cat, _]) => 
                cat.toLowerCase() === category.toLowerCase()
            )?.[1];
            
            if (!categoryTier) {
                await interaction.editReply('Invalid blacklist category.');
                return;
            }
            
            actualTier = categoryTier;
            const tierSnapshot = await db.collection('punishment_tiers')
                .where('type_uuid', '==', typeUuid)
                .where('punishment_tier', '==', categoryTier)
                .get();
            
            if (!tierSnapshot.empty) {
                tierData = tierSnapshot.docs[0].data();
            }
        } else if (['suspension', 'suspensions', 'strike', 'strikes', 'demotion', 'demotions'].includes(punishmentType)) {
            // For other punishment types that require tier
            actualTier = tier;
            const tierSnapshot = await db.collection('punishment_tiers')
                .where('type_uuid', '==', typeUuid)
                .where('punishment_tier', '==', tier)
                .get();

            if (tierSnapshot.empty) {
                await interaction.editReply(`Invalid tier ${tier} for punishment type ${punishmentType}.`);
                return;
            }

            tierData = tierSnapshot.docs[0].data();
        } else {
            // For reminder and warning, always use tier 1
            actualTier = 1;
            const tierSnapshot = await db.collection('punishment_tiers')
                .where('type_uuid', '==', typeUuid)
                .where('punishment_tier', '==', 1)
                .get();
            
            if (!tierSnapshot.empty) {
                tierData = tierSnapshot.docs[0].data();
            }
        }

        // Check if user already has a record
        const userDoc = await db.collection('individuals').doc(robloxId.toString()).get();
        let punishmentHistory = '';
        let punishmentRecordId;

        if (userDoc.exists) {
            const userData = userDoc.data();
            punishmentHistory = userData.punishment_history || '';
            punishmentRecordId = userData.punishment_record_id;
        } else {
            punishmentRecordId = await getNextPunishmentId();
        }

        // Create punishment entry
        const now = new Date();
        const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
        
        // Update punishment history
        let historyLabel = punishmentType.charAt(0).toUpperCase() + punishmentType.slice(1);
        if ((punishmentType === 'blacklist' || punishmentType === 'blacklists') && tierData?.category) {
            historyLabel = `Blacklist (${tierData.category})`;
        } else if (actualTier && !['reminder', 'reminders', 'warning', 'warnings'].includes(punishmentType)) {
            historyLabel = `Tier ${actualTier} ${historyLabel}`;
        }
        
        const newHistoryEntry = `• ${formattedDate} - ${historyLabel} - ${reason}`;
        if (punishmentHistory) {
            punishmentHistory += `\n${newHistoryEntry}`;
        } else {
            punishmentHistory = newHistoryEntry;
        }

        // Save to Firebase
        const individualData = {
            roblox_id: robloxId,
            created_on: admin.firestore.FieldValue.serverTimestamp(),
            evidence: evidence,
            reason: reason,
            punishment_history: punishmentHistory,
            punishment_type: punishmentType,
            punishment_record_id: punishmentRecordId,
            current_tier: actualTier,
            tier_uuid: tierData?.tier_uuid || null,
            punishment_start_date: admin.firestore.FieldValue.serverTimestamp(),
            punishment_end_date: calculateEndDate(now, tierData?.length),
            is_active: true
        };

        if ((punishmentType === 'blacklist' || punishmentType === 'blacklists') && category) {
            individualData.blacklist_category = category;
        }

        await db.collection('individuals').doc(robloxId.toString()).set(individualData);

        // Create embed response
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('Punishment Issued')
            .setDescription(`User **${username}** (ID: ${robloxId}) has been punished.`)
            .addFields(
                { name: 'Record ID', value: punishmentRecordId.toString(), inline: true },
                { name: 'Type', value: punishmentType, inline: true }
            );

        if (punishmentType === 'blacklist' || punishmentType === 'blacklists') {
            embed.addFields(
                { name: 'Category', value: category, inline: true },
                { name: 'Duration', value: 'Permanent', inline: true }
            );
        } else if (['suspension', 'suspensions', 'strike', 'strikes', 'demotion', 'demotions'].includes(punishmentType)) {
            embed.addFields(
                { name: 'Tier', value: actualTier.toString(), inline: true },
                { name: 'Duration', value: tierData?.length === -1 ? 'Permanent' : tierData?.length === null ? 'N/A' : `${tierData.length} days`, inline: true }
            );
        }

        embed.addFields(
            { name: 'Reason', value: reason },
            { name: 'Evidence', value: evidence }
        )
        .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};