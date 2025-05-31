// src/handlers/commandHandler.js
const { REST, Routes, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = new Collection();

async function registerCommands() {
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    const commandData = [];
    const seenCommands = new Set();
    
    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            
            // Use dynamic import instead of require
            const commandModule = await import(`file://${filePath}`);
            
            // Handle both default and named exports
            const command = commandModule.default || commandModule;
            
            // Skip if we've already seen this command
            if (seenCommands.has(command.data.name)) {
                continue;
            }
            
            console.log(`Loading command: ${command.data.name}`);
            seenCommands.add(command.data.name);
            commands.set(command.data.name, command);
            commandData.push(command.data.toJSON());
        } catch (error) {
            console.error(`Error loading command ${file}:`, error);
        }
    }
    
    console.log(`Registering ${commandData.length} unique commands...`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commandData }
        );
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

function getCommands() {
    return commands;
}

// Make sure we're exporting both functions
module.exports = { registerCommands, getCommands };