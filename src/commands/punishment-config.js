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