import 'dotenv/config';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';

async function createEkoUser() {
  await connectDB();

  // Check if Eko already exists
  const existing = await User.findOne({ username: 'eko' });
  if (existing) {
    console.log('Eko user already exists:', existing._id);
    process.exit(0);
  }

  // Create Eko user
  const eko = new User({
    username: 'eko',
    displayName: 'Eko',
    email: 'eko@organizer.local',
    passwordHash: 'N/A', // No password (never logs in manually)
    isBot: true,
    isOnline: true, // Always "online"
    status: 'available',
  });

  await eko.save();
  console.log('Eko user created:', eko._id);
  process.exit(0);
}

createEkoUser().catch((err) => {
  console.error('Error creating Eko user:', err);
  process.exit(1);
});
