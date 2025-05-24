const axios = require('axios');

async function getRobloxId(username) {
    try {
        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username]
        });
        
        if (response.data.data.length > 0) {
            return response.data.data[0].id;
        }
        return null;
    } catch (error) {
        console.error('Error fetching Roblox ID:', error);
        return null;
    }
}

async function getRobloxUsername(userId) {
    try {
        const response = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
        return response.data.name;
    } catch (error) {
        console.error('Error fetching Roblox username:', error);
        return 'Unknown User';
    }
}

module.exports = {
    getRobloxId,
    getRobloxUsername
};