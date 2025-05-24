// config/firebase.js
const admin = require('firebase-admin');

let db;
let initialized = false;

const initializeFirebase = async () => {
    if (initialized) return db;
    
    try {
        // Using environment variables (more secure)
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID || "justice-department-bot",
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
            })
        });

        db = admin.firestore();
        initialized = true;
        
        console.log('Firebase Admin SDK initialized successfully');
        
        // Don't initialize punishment data here to avoid circular dependency
        // We'll call it from index.js instead
        
        return db;
    } catch (error) {
        console.error('Firebase initialization error:', error);
        throw error;
    }
};

const getDb = () => {
    if (!db) {
        throw new Error('Firebase not initialized. Call initializeFirebase() first.');
    }
    return db;
};

const getAdmin = () => admin;

module.exports = { initializeFirebase, getDb, getAdmin };