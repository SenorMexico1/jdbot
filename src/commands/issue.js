// src/commands/issue.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb, getAdmin } = require('../../config/firebase');
const { getRobloxId, getRobloxAvatar } = require('../utils/roblox');
const { getPunishmentTypes, getBlacklistCategories, getNextPunishmentId } = require('../utils/punishmentTypes');
const { calculateEndDate } = require('../utils/firebase');

const issueCommand = {
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
        const tierOrCategory = interaction.options.getString('tier');
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

        // Get punishment type UUID and type data
        const typeUuid = punishmentTypes[punishmentType];
        
        // Get full type data including stacking info
        const typeDoc = await db.collection('punishment_types').doc(typeUuid.toString()).get();
        const typeData = typeDoc.exists ? typeDoc.data() : null;
        
        if (!typeData) {
            await interaction.editReply('Error: Could not find punishment type configuration.');
            return;
        }

        // Check stacking rules
        if (typeData.stack !== undefined) {
            // First check the new punishments collection for all active punishments
            let hasConflicts = false;
            let conflictingPunishment = null;
            
            try {
                const activePunishmentsSnapshot = await db.collection('punishments')
                    .where('roblox_id', '==', robloxId)
                    .where('is_active', '==', true)
                    .get();
                
                for (const doc of activePunishmentsSnapshot.docs) {
                    const activePunishment = doc.data();
                    
                    // Check non-concurrency rules
                    if (typeData.nonconcurrency && typeData.nonconcurrency.length > 0) {
                        const activePunishmentTypeUuid = punishmentTypes[activePunishment.punishment_type];
                        
                        if (typeData.nonconcurrency.includes(activePunishmentTypeUuid)) {
                            hasConflicts = true;
                            conflictingPunishment = activePunishment;
                            break;
                        }
                    }
                    
                    // Check if active punishment type has non-concurrency rules against this new type
                    const activeTypeDoc = await db.collection('punishment_types')
                        .where('punishment_type', '==', activePunishment.punishment_type)
                        .get();
                    
                    if (!activeTypeDoc.empty) {
                        const activeTypeData = activeTypeDoc.docs[0].data();
                        if (activeTypeData.nonconcurrency && activeTypeData.nonconcurrency.includes(typeUuid)) {
                            hasConflicts = true;
                            conflictingPunishment = activePunishment;
                            break;
                        }
                    }
                }
                
                if (hasConflicts && conflictingPunishment) {
                    await interaction.editReply(
                        `❌ Cannot issue ${punishmentType} - User has an active ${conflictingPunishment.punishment_type} (#${conflictingPunishment.punishment_record_id}) which conflicts with ${punishmentType}.`
                    );
                    return;
                }
                
                // Check stacking for same type
                if (!typeData.stack) {
                    const samePunishmentType = activePunishmentsSnapshot.docs.find(doc => 
                        doc.data().punishment_type === punishmentType
                    );
                    
                    if (samePunishmentType) {
                        const existingPunishment = samePunishmentType.data();
                        await interaction.editReply(
                            `❌ Cannot issue ${punishmentType} - User already has an active ${punishmentType} (#${existingPunishment.punishment_record_id}) and this type is non-stackable.`
                        );
                        return;
                    }
                }
                
                // Check stack max
                if (typeData.stack && typeData.stackmax !== -1) {
                    const activeCount = await countActiveTypeForUser(db, robloxId, punishmentType);
                    
                    if (activeCount >= typeData.stackmax) {
                        await interaction.editReply(
                            `❌ Cannot issue ${punishmentType} - User already has ${activeCount} active ${punishmentType}(s). Maximum allowed: ${typeData.stackmax}`
                        );
                        return;
                    }
                }
                
            } catch (error) {
                // If punishments collection doesn't exist, fall back to old validation
                console.log('Using legacy stacking validation');
                
                // Get all active punishments for this user (old structure)
                const userDoc = await db.collection('individuals').doc(robloxId.toString()).get();
                
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    
                    // Check if user has active punishment
                    if (userData.is_active !== false) {
                        const currentTypeUuid = punishmentTypes[userData.punishment_type];
                        
                        // Check non-concurrency rules
                        if (typeData.nonconcurrency && typeData.nonconcurrency.length > 0) {
                            if (typeData.nonconcurrency.includes(currentTypeUuid)) {
                                await interaction.editReply(
                                    `❌ Cannot issue ${punishmentType} - User already has an active ${userData.punishment_type} which conflicts with ${punishmentType}.`
                                );
                                return;
                            }
                        }
                        
                        // Check if current punishment type also has non-concurrency rules
                        const currentTypeDoc = await db.collection('punishment_types').doc(currentTypeUuid.toString()).get();
                        if (currentTypeDoc.exists) {
                            const currentTypeData = currentTypeDoc.data();
                            if (currentTypeData.nonconcurrency && currentTypeData.nonconcurrency.includes(typeUuid)) {
                                await interaction.editReply(
                                    `❌ Cannot issue ${punishmentType} - User's active ${userData.punishment_type} cannot coexist with ${punishmentType}.`
                                );
                                return;
                            }
                        }
                        
                        // Check stacking for same type
                        if (userData.punishment_type === punishmentType) {
                            if (!typeData.stack) {
                                await interaction.editReply(
                                    `❌ Cannot issue ${punishmentType} - User already has an active ${punishmentType} and this type is non-stackable.`
                                );
                                return;
                            }
                        }
                    }
                }
            }
        }

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

        // Save to Firebase - create in both collections for compatibility
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

        // Save to individuals collection (legacy support)
        await db.collection('individuals').doc(robloxId.toString()).set(individualData);
        
        // Also save to punishments collection for multiple punishments support
        await db.collection('punishments').doc(punishmentRecordId.toString()).set({
            ...individualData,
            roblox_id: robloxId // Ensure it's stored as a number
        });

        let p = '';
        const punishmentMap = {
            'reminder': 'reminded',
            'warning': 'warned',
            'strike': 'striked',
            'demotion': 'demoted',
            'suspension': 'suspended',
            'blacklist': 'blacklisted'
        };

        // Get avatar URL
        const avatarUrl = await getRobloxAvatar(robloxId);

        // Create embed response
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`${punishmentType ? punishmentType.charAt(0).toUpperCase() + punishmentType.slice(1) : 'Punished'} Issued`)
            .setDescription(`User **${username}** (ID: ${robloxId}) has been ${punishmentMap[punishmentType] || 'punished'}.`)
            .addFields(
                { name: 'Record ID', value: punishmentRecordId.toString(), inline: true },
                { name: 'Type', value: punishmentType, inline: true }
            );

        if (avatarUrl) {
            embed.setThumbnail(avatarUrl);
        }

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

// Helper function to count active punishments of a specific type for a user
async function countActiveTypeForUser(db, robloxId, punishmentType) {
    try {
        // Check in punishments collection first (new structure)
        const punishmentsSnapshot = await db.collection('punishments')
            .where('roblox_id', '==', robloxId)
            .where('punishment_type', '==', punishmentType)
            .where('is_active', '==', true)
            .get();
        
        return punishmentsSnapshot.size;
    } catch (error) {
        // Fallback to old structure
        const userDoc = await db.collection('individuals').doc(robloxId.toString()).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.is_active !== false && userData.punishment_type === punishmentType) {
                return 1;
            }
        }
        
        return 0;
    }
}

// Export as default for ES module compatibility
module.exports = issueCommand;