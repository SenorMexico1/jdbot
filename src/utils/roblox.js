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

async function getRobloxAvatar(userId) {
    try {
        // Get avatar thumbnail - headshot at 150x150
        const response = await axios.get(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
        );
        
        if (response.data.data && response.data.data.length > 0) {
            return response.data.data[0].imageUrl;
        }
        return null;
    } catch (error) {
        console.error('Error fetching Roblox avatar:', error);
        return null;
    }
}

module.exports = {
    getRobloxId,
    getRobloxUsername,
    getRobloxAvatar
};