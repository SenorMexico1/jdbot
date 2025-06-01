// src/commands/punishment-config.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb } = require('../../config/firebase');
const { clearCache } = require('../utils/punishmentTypes');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('punishment-config')
        .setDescription('Manage punishment types and tiers')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-type')
                .setDescription('Add a new punishment type')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the punishment type')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('type_uuid')
                        .setDescription('Unique ID for this punishment type')
                        .setRequired(true)
                        .setMinValue(1000)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-tier')
                .setDescription('Add a tier to a punishment type')
                .addStringOption(option =>
                    option.setName('type_name')
                        .setDescription('Name of the punishment type')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('tier_number')
                        .setDescription('Tier number')
                        .setRequired(true)
                        .setMinValue(1))
                .addIntegerOption(option =>
                    option.setName('length')
                        .setDescription('Length in days (-1 for permanent, 0 for N/A)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('Category name (only for blacklists)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-type')
                .setDescription('Remove a punishment type')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the punishment type to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-tier')
                .setDescription('Remove a tier from a punishment type')
                .addIntegerOption(option =>
                    option.setName('tier_uuid')
                        .setDescription('Tier UUID to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-types')
                .setDescription('List all punishment types'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-tiers')
                .setDescription('List all tiers for a punishment type')
                .addStringOption(option =>
                    option.setName('type_name')
                        .setDescription('Name of the punishment type')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-all')
                .setDescription('List all punishment types and their tiers in a tree view'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-stacking')
                .setDescription('Configure stacking settings for a punishment type')
                .addStringOption(option =>
                    option.setName('type_name')
                        .setDescription('Name of the punishment type')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('stack')
                        .setDescription('Whether this punishment type can stack')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('stackmax')
                        .setDescription('Maximum stack count (-1 for unlimited)')
                        .setRequired(true)
                        .setMinValue(-1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-nonconcurrency')
                .setDescription('Set which punishment types cannot coexist with this one')
                .addStringOption(option =>
                    option.setName('type_name')
                        .setDescription('Name of the punishment type')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('nonconcurrent_types')
                        .setDescription('Comma-separated type names (or "none" for no restrictions)')
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const db = getDb();

        switch (subcommand) {
            case 'add-type':
                await handleAddType(interaction, db);
                break;
            case 'add-tier':
                await handleAddTier(interaction, db);
                break;
            case 'remove-type':
                await handleRemoveType(interaction, db);
                break;
            case 'remove-tier':
                await handleRemoveTier(interaction, db);
                break;
            case 'list-types':
                await handleListTypes(interaction, db);
                break;
            case 'list-tiers':
                await handleListTiers(interaction, db);
                break;
            case 'list-all':
                await handleListAll(interaction, db);
                break;
            case 'set-stacking':
                await handleSetStacking(interaction, db);
                break;
            case 'set-nonconcurrency':
                await handleSetNonconcurrency(interaction, db);
                break;
        }
    }
};

async function handleAddType(interaction, db) {
    await interaction.deferReply();

    const name = interaction.options.getString('name').toLowerCase();
    const typeUuid = interaction.options.getInteger('type_uuid');

    // Check if type already exists - Admin SDK syntax
    const existingDoc = await db.collection('punishment_types').doc(typeUuid.toString()).get();
    if (existingDoc.exists) {
        await interaction.editReply('A punishment type with that UUID already exists.');
        return;
    }

    // Add the new type
    await db.collection('punishment_types').doc(typeUuid.toString()).set({
        punishment_type: name,
        type_uuid: typeUuid
    });

    // Clear cache after adding new type
    clearCache();

    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Punishment Type Added')
        .setDescription(`Successfully added punishment type: **${name}**`)
        .addFields(
            { name: 'Type Name', value: name, inline: true },
            { name: 'Type UUID', value: typeUuid.toString(), inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleAddTier(interaction, db) {
    await interaction.deferReply();

    const typeName = interaction.options.getString('type_name').toLowerCase();
    const tierNumber = interaction.options.getInteger('tier_number');
    const length = interaction.options.getInteger('length');
    const category = interaction.options.getString('category');

    // Find the punishment type - Admin SDK syntax
    const typesSnapshot = await db.collection('punishment_types').get();
    let typeData = null;
    
    typesSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.punishment_type === typeName) {
            typeData = data;
        }
    });

    if (!typeData) {
        await interaction.editReply(`Punishment type "${typeName}" not found.`);
        return;
    }

    // Generate tier UUID
    const tierUuid = 2000 + (typeData.type_uuid % 1000) * 100 + tierNumber;

    // Check if tier already exists - Admin SDK syntax
    const existingTierSnapshot = await db.collection('punishment_tiers')
        .where('type_uuid', '==', typeData.type_uuid)
        .where('punishment_tier', '==', tierNumber)
        .get();

    if (!existingTierSnapshot.empty) {
        await interaction.editReply(`Tier ${tierNumber} already exists for ${typeName}.`);
        return;
    }

    // Add the tier
    const tierData = {
        type_uuid: typeData.type_uuid,
        punishment_tier: tierNumber,
        tier_uuid: tierUuid,
        length: length === 0 ? null : length
    };

    if (category) {
        tierData.category = category;
    }

    await db.collection('punishment_tiers').doc(tierUuid.toString()).set(tierData);

    // Clear cache after adding new tier
    clearCache();

    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Punishment Tier Added')
        .setDescription(`Successfully added tier ${tierNumber} to ${typeName}`)
        .addFields(
            { name: 'Type', value: typeName, inline: true },
            { name: 'Tier', value: tierNumber.toString(), inline: true },
            { name: 'Duration', value: length === -1 ? 'Permanent' : length === 0 ? 'N/A' : `${length} days`, inline: true }
        );

    if (category) {
        embed.addFields({ name: 'Category', value: category, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
}

async function handleRemoveType(interaction, db) {
    await interaction.deferReply();

    const name = interaction.options.getString('name').toLowerCase();

    // Find the punishment type - Admin SDK syntax
    const typesSnapshot = await db.collection('punishment_types').get();
    let typeToRemove = null;
    
    typesSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.punishment_type === name) {
            typeToRemove = { id: doc.id, data: data };
        }
    });

    if (!typeToRemove) {
        await interaction.editReply(`Punishment type "${name}" not found.`);
        return;
    }

    // Check if any individuals have this punishment type - Admin SDK syntax
    const individualsSnapshot = await db.collection('individuals')
        .where('punishment_type', '==', name)
        .get();

    if (!individualsSnapshot.empty) {
        await interaction.editReply(`Cannot remove "${name}" - ${individualsSnapshot.size} user(s) have this punishment type.`);
        return;
    }

    // Remove all tiers for this type - Admin SDK syntax
    const tiersSnapshot = await db.collection('punishment_tiers')
        .where('type_uuid', '==', typeToRemove.data.type_uuid)
        .get();
    
    const batch = db.batch();
    
    tiersSnapshot.forEach(doc => {
        batch.delete(doc.ref);
    });

    // Remove the type
    batch.delete(db.collection('punishment_types').doc(typeToRemove.id));
    
    await batch.commit();

    // Clear cache after removing type
    clearCache();

    const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('Punishment Type Removed')
        .setDescription(`Successfully removed punishment type: **${name}**`)
        .addFields(
            { name: 'Tiers Removed', value: tiersSnapshot.size.toString(), inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleRemoveTier(interaction, db) {
    await interaction.deferReply();

    const tierUuid = interaction.options.getInteger('tier_uuid');

    // Check if tier exists - Admin SDK syntax
    const tierDoc = await db.collection('punishment_tiers').doc(tierUuid.toString()).get();
    if (!tierDoc.exists) {
        await interaction.editReply(`Tier with UUID ${tierUuid} not found.`);
        return;
    }

    const tierData = tierDoc.data();

    // Check if any individuals have this tier - Admin SDK syntax
    const individualsSnapshot = await db.collection('individuals')
        .where('tier_uuid', '==', tierUuid)
        .get();

    if (!individualsSnapshot.empty) {
        await interaction.editReply(`Cannot remove tier - ${individualsSnapshot.size} user(s) have this tier assigned.`);
        return;
    }

    // Remove the tier
    await db.collection('punishment_tiers').doc(tierUuid.toString()).delete();

    // Clear cache after removing tier
    clearCache();

    const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('Punishment Tier Removed')
        .setDescription(`Successfully removed tier`)
        .addFields(
            { name: 'Tier UUID', value: tierUuid.toString(), inline: true },
            { name: 'Tier Number', value: tierData.punishment_tier.toString(), inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleListTypes(interaction, db) {
    await interaction.deferReply();

    const typesSnapshot = await db.collection('punishment_types').get();
    
    if (typesSnapshot.empty) {
        await interaction.editReply('No punishment types found.');
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Punishment Types')
        .setDescription('All configured punishment types:')
        .setTimestamp();

    const types = [];
    typesSnapshot.forEach(doc => {
        const data = doc.data();
        types.push(`• **${data.punishment_type}** (UUID: ${data.type_uuid})`);
    });

    embed.addFields({ name: 'Types', value: types.join('\n') });

    await interaction.editReply({ embeds: [embed] });
}

async function handleListTiers(interaction, db) {
    await interaction.deferReply();

    const typeName = interaction.options.getString('type_name').toLowerCase();

    // Find the punishment type - Admin SDK syntax
    const typesSnapshot = await db.collection('punishment_types').get();
    let typeData = null;
    
    typesSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.punishment_type === typeName) {
            typeData = data;
        }
    });

    if (!typeData) {
        await interaction.editReply(`Punishment type "${typeName}" not found.`);
        return;
    }

    // Get all tiers for this type - Admin SDK syntax
    const tiersSnapshot = await db.collection('punishment_tiers')
        .where('type_uuid', '==', typeData.type_uuid)
        .get();

    if (tiersSnapshot.empty) {
        await interaction.editReply(`No tiers found for ${typeName}.`);
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`Tiers for ${typeName}`)
        .setDescription(`Type UUID: ${typeData.type_uuid}`)
        .setTimestamp();

    const tiers = [];
    const tierDocs = [];
    tiersSnapshot.forEach(doc => {
        tierDocs.push(doc.data());
    });

    // Sort by tier number
    tierDocs.sort((a, b) => a.punishment_tier - b.punishment_tier);

    tierDocs.forEach(data => {
        let tierInfo = `• **Tier ${data.punishment_tier}** (UUID: ${data.tier_uuid})`;
        if (data.length === -1) {
            tierInfo += ' - Permanent';
        } else if (data.length === null) {
            tierInfo += ' - N/A';
        } else {
            tierInfo += ` - ${data.length} days`;
        }
        if (data.category) {
            tierInfo += ` - Category: ${data.category}`;
        }
        tiers.push(tierInfo);
    });

    embed.addFields({ name: 'Tiers', value: tiers.join('\n') });

    await interaction.editReply({ embeds: [embed] });
}

async function handleListAll(interaction, db) {
    await interaction.deferReply();

    // Get all punishment types
    const typesSnapshot = await db.collection('punishment_types').get();
    
    if (typesSnapshot.empty) {
        await interaction.editReply('No punishment types configured.');
        return;
    }

    // Create a map of types
    const typesMap = new Map();
    typesSnapshot.forEach(doc => {
        const data = doc.data();
        typesMap.set(data.type_uuid, {
            name: data.punishment_type,
            uuid: data.type_uuid,
            stack: data.stack,
            stackmax: data.stackmax,
            nonconcurrency: data.nonconcurrency || [],
            tiers: []
        });
    });

    // Get all tiers and organize by type
    const tiersSnapshot = await db.collection('punishment_tiers').get();
    
    tiersSnapshot.forEach(doc => {
        const tierData = doc.data();
        const typeInfo = typesMap.get(tierData.type_uuid);
        
        if (typeInfo) {
            let duration;
            if (tierData.length === -1) {
                duration = 'Permanent';
            } else if (tierData.length === null) {
                duration = 'N/A';
            } else {
                // Format duration nicely
                const days = tierData.length;
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

            typeInfo.tiers.push({
                number: tierData.punishment_tier,
                uuid: tierData.tier_uuid,
                duration: duration,
                category: tierData.category || null
            });
        }
    });

    // Sort types by UUID (numerical order)
    const sortedTypes = Array.from(typesMap.values()).sort((a, b) => 
        a.uuid - b.uuid
    );

    // Sort tiers within each type
    sortedTypes.forEach(type => {
        type.tiers.sort((a, b) => a.number - b.number);
    });

    // Create embed
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🌳 Punishment Configuration Overview')
        .setDescription('Complete hierarchy of all punishment types and tiers')
        .setTimestamp();

    // Count statistics
    const totalTypes = sortedTypes.length;
    const totalTiers = sortedTypes.reduce((sum, type) => sum + type.tiers.length, 0);
    
    embed.addFields({
        name: '📊 Statistics',
        value: `Total Types: **${totalTypes}**\nTotal Tiers: **${totalTiers}**`,
        inline: false
    });

    // Build tree view
    let treeView = '';
    
    for (const type of sortedTypes) {
        // Type header with stacking info
        treeView += `\n**${type.name.toUpperCase()}** (UUID: ${type.uuid})`;
        
        // Add stacking indicators
        const stackInfo = [];
        if (type.stack !== undefined) {
            if (type.stack) {
                const maxText = type.stackmax === -1 ? '∞' : type.stackmax;
                stackInfo.push(`📚 Stackable (Max: ${maxText})`);
            } else {
                stackInfo.push('📑 Non-stackable');
            }
        }
        
        if (type.nonconcurrency && type.nonconcurrency.length > 0) {
            // Get names of non-concurrent types
            const nonConcurrentNames = type.nonconcurrency.map(uuid => {
                const ncType = typesMap.get(uuid);
                return ncType ? ncType.name : `UUID:${uuid}`;
            }).join(', ');
            stackInfo.push(`🚫 Conflicts with: ${nonConcurrentNames}`);
        }
        
        if (stackInfo.length > 0) {
            treeView += '\n' + stackInfo.map(info => `  ${info}`).join('\n');
        }
        
        treeView += '\n';
        
        if (type.tiers.length === 0) {
            treeView += '└── *No tiers configured*\n';
        } else {
            // Add each tier
            type.tiers.forEach((tier, index) => {
                const isLast = index === type.tiers.length - 1;
                const prefix = isLast ? '└──' : '├──';
                
                let tierLine = `${prefix} [UUID: ${tier.uuid}] Tier ${tier.number} (${tier.duration})`;
                
                // Add category for blacklists
                if (tier.category) {
                    tierLine += ` - ${tier.category}`;
                }
                
                treeView += tierLine + '\n';
            });
        }
    }

    // Split into multiple fields if needed (Discord has 1024 char limit per field)
    const chunks = [];
    let currentChunk = '';
    const lines = treeView.split('\n');
    
    for (const line of lines) {
        if ((currentChunk + line + '\n').length > 1000) {
            chunks.push(currentChunk);
            currentChunk = line + '\n';
        } else {
            currentChunk += line + '\n';
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }

    // Add fields to embed
    chunks.forEach((chunk, index) => {
        embed.addFields({
            name: chunks.length > 1 ? `Configuration Tree (Part ${index + 1})` : 'Configuration Tree',
            value: chunk || 'Empty',
            inline: false
        });
    });

    // Add help footer
    embed.setFooter({ 
        text: 'Use /punishment-config commands to modify types and tiers' 
    });

    await interaction.editReply({ embeds: [embed] });
}

async function handleSetStacking(interaction, db) {
    await interaction.deferReply();

    const typeName = interaction.options.getString('type_name').toLowerCase();
    const stack = interaction.options.getBoolean('stack');
    const stackmax = interaction.options.getInteger('stackmax');

    // Validate stackmax
    if (stack && (stackmax === 0 || stackmax === 1)) {
        await interaction.editReply('⚠️ Warning: Setting stackmax to 0 or 1 with stack=true is not recommended. Consider setting stack to false instead.');
        return;
    }

    // Find the punishment type
    const typesSnapshot = await db.collection('punishment_types').get();
    let typeDoc = null;
    
    typesSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.punishment_type === typeName) {
            typeDoc = doc;
        }
    });

    if (!typeDoc) {
        await interaction.editReply(`Punishment type "${typeName}" not found.`);
        return;
    }

    // Update the stacking configuration
    await typeDoc.ref.update({
        stack: stack,
        stackmax: stackmax
    });

    // Clear cache
    clearCache();

    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Stacking Configuration Updated')
        .setDescription(`Updated stacking settings for **${typeName}**`)
        .addFields(
            { name: 'Stackable', value: stack ? '✅ Yes' : '❌ No', inline: true },
            { name: 'Max Stack', value: stackmax === -1 ? '∞ (Unlimited)' : stackmax.toString(), inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleSetNonconcurrency(interaction, db) {
    await interaction.deferReply();

    const typeName = interaction.options.getString('type_name').toLowerCase();
    const nonconcurrentInput = interaction.options.getString('nonconcurrent_types').toLowerCase();

    // Find the punishment type
    const typesSnapshot = await db.collection('punishment_types').get();
    let typeDoc = null;
    const typeMap = new Map();
    
    typesSnapshot.forEach(doc => {
        const data = doc.data();
        typeMap.set(data.punishment_type, data.type_uuid);
        if (data.punishment_type === typeName) {
            typeDoc = doc;
        }
    });

    if (!typeDoc) {
        await interaction.editReply(`Punishment type "${typeName}" not found.`);
        return;
    }

    // Parse non-concurrent types
    let nonconcurrencyUuids = [];
    
    if (nonconcurrentInput !== 'none' && nonconcurrentInput !== '') {
        const typeNames = nonconcurrentInput.split(',').map(t => t.trim());
        
        for (const ncTypeName of typeNames) {
            const uuid = typeMap.get(ncTypeName);
            if (!uuid) {
                await interaction.editReply(`❌ Error: Punishment type "${ncTypeName}" not found.`);
                return;
            }
            nonconcurrencyUuids.push(uuid);
        }
    }

    // Update the non-concurrency configuration
    await typeDoc.ref.update({
        nonconcurrency: nonconcurrencyUuids
    });

    // Clear cache
    clearCache();

    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Non-Concurrency Configuration Updated')
        .setDescription(`Updated non-concurrency settings for **${typeName}**`);

    if (nonconcurrencyUuids.length === 0) {
        embed.addFields({ 
            name: 'Conflicts With', 
            value: 'None - Can coexist with all punishment types' 
        });
    } else {
        const conflictNames = nonconcurrencyUuids.map(uuid => {
            const type = Array.from(typeMap.entries()).find(([_, u]) => u === uuid);
            return type ? type[0] : `UUID:${uuid}`;
        });
        
        embed.addFields({ 
            name: 'Conflicts With', 
            value: conflictNames.join(', ') 
        });
    }

    embed.setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}