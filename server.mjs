import express from 'express';
import mongoose from 'mongoose';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Redis Client
const redisClient = createClient({
  url: process.env.REDIS_URL
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
await redisClient.connect();
console.log('Redis connected');

// User Model
const userSchema = new mongoose.Schema({
  name: String,
  email: String
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Routes
app.post('/users', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check cache first
    const cachedUser = await redisClient.get(`user:${id}`);
    if (cachedUser) {
      console.log('Serving from cache');
      return res.json(JSON.parse(cachedUser));
    }

    // If not in cache, fetch from DB
    const user = await User.findById(id);
    if (!user) return res.status(404).send();

    // Cache for future requests (1 hour expiration)
    await redisClient.setEx(`user:${id}`, 3600, JSON.stringify(user));
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Server startup
const startServer = async () => {
  await connectDB();
  
  app.listen(3000, () => {
    console.log('Server running on port 3000');
  });
};

startServer().catch(err => {
  console.error('Server startup failed:', err);
  process.exit(1);
});