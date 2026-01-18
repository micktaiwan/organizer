// MongoDB connection management
import mongoose from 'mongoose';
import { MONGODB_URI } from '../config.mjs';
import { log } from '../logger.mjs';

let mongoConnected = false;



async function ensureMongoConnection() {
  if (mongoConnected) return;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI not configured');
  }
  try {
    await mongoose.connect(MONGODB_URI);
    mongoConnected = true;
    log('info', '[MongoDB] Connected for notes access');
  } catch (error) {
    log('error', `[MongoDB] Connection failed: ${error.message}`);
    throw error;
  }
}

export { ensureMongoConnection };
