// src/handlers/eventHandler.js
function setupEventHandlers(client, commands) {
    client.once('ready', () => {
        console.log(`Logged in as ${client.user.tag}!`);
    });
    
    client.on('interactionCreate', async interaction => {
        // Handle autocomplete
        if (interaction.isAutocomplete()) {
            const command = commands.get(interaction.commandName);
            
            if (!command || !command.autocomplete) {
                console.log(`No autocomplete handler for: ${interaction.commandName}`);
                return;
            }
            
            try {
                console.log(`Running autocomplete for: ${interaction.commandName}`);
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(`Autocomplete error for ${interaction.commandName}:`, error);
                try {
                    await interaction.respond([]);
                } catch (e) {
                    console.error('Failed to send empty autocomplete response:', e);
                }
            }
            return;
        }
        
        // Handle commands
        if (!interaction.isChatInputCommand()) return;
        
        const command = commands.get(interaction.commandName);
        
        if (!command) return;
        
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error('Error executing command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your command.', 
                    ephemeral: true 
                });
            }
        }
    });
}

module.exports = { setupEventHandlers };