import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: '../.env' });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.DASHBOARD_PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB_NAME || 'etsy_scraper';

app.use(express.static(`${__dirname}/public`));

async function main() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('📊 Dashboard connected to MongoDB successfully!');
    const db = client.db(DB_NAME);
    const collection = db.collection('listings');

    // --- WebSocket Connection ---
    io.on('connection', async (socket) => {
      console.log('✨ A user connected to the dashboard');

      // Send initial data on connection
      const totalListings = await collection.countDocuments();
      const recentListings = await collection.find().sort({ detailsScrapedAt: -1 }).limit(10).toArray();
      
      socket.emit('initial-data', {
        totalListings,
        recentListings
      });

      socket.on('disconnect', () => {
        console.log('👋 A user disconnected');
      });
    });

    // --- Polling for Updates ---
    let lastKnownTotal = 0;
    setInterval(async () => {
      const totalListings = await collection.countDocuments();
      if (totalListings !== lastKnownTotal) {
        const recentListings = await collection.find().sort({ detailsScrapedAt: -1 }).limit(10).toArray();
        const stats = await getStats(collection, totalListings);
        io.emit('stats-update', { totalListings, stats });
        io.emit('initial-data', { totalListings, recentListings, stats });
        lastKnownTotal = totalListings;
      }
    }, 2000); // Poll every 2 seconds

    async function getStats(collection, totalListings) {
      const totalListingsInDb = await collection.countDocuments();
      const withTags = await collection.countDocuments({ 'tags.0': { $exists: true } });
      const withMaterials = await collection.countDocuments({ 'materials.0': { $exists: true } });
      const withDescription = await collection.countDocuments({ description: { $ne: null } });

      return {
        total: totalListings,
        totalListingsInDb,
        withTags,
        withMaterials,
        withDescription
      };
    }

    server.listen(PORT, () => {
      console.log(`🚀 Real-time dashboard is running at http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('❌ Failed to connect to MongoDB or start server:', err);
    process.exit(1);
  }
}

main();
