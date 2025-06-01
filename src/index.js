// src/index.js
const { Client, GatewayIntentBits } = require('discord.js');
const { initializeFirebase } = require('../config/firebase');
const { initializePunishmentData } = require('./utils/firebase');
const { registerCommands, getCommands } = require('./handlers/commandHandler');
const { setupEventHandlers } = require('./handlers/eventHandler');
const { scheduleJobs } = require('./jobs/checkExpiredPunishments');

require('dotenv').config();

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

// Initialize
(async () => {
    try {
        // Initialize Firebase first
        await initializeFirebase();
        
        // Then initialize punishment data
        await initializePunishmentData();

        // Register commands
        await registerCommands();
        
        // Get commands and setup event handlers
        const commands = getCommands();
        setupEventHandlers(client, commands);
        
        // Login to Discord
        await client.login(process.env.DISCORD_TOKEN);

        scheduleJobs(client); // Add this
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
})();