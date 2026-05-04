import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'its-prototype-secret-key';
const MONGODB_URI = process.env.MONGODB_URI;

// Initialize AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// --- MongoDB Schemas ---
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'teacher', 'admin'], default: 'student' },
  createdAt: { type: Date, default: Date.now }
});

const MasterySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  masteryLevel: { type: String, default: 'Low' },
  repeatedMistakes: [String],
  progress: { type: Number, default: 0 },
  history: [{
    timestamp: { type: Date, default: Date.now },
    mistake: String,
    mastery: String
  }]
});

const User = mongoose.model('User', UserSchema);
const Mastery = mongoose.model('Mastery', MasterySchema);

// --- MongoDB Connection ---
let isConnected = false;
const connectDB = async () => {
  if (isConnected) return;
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI not found.');
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log('Connected to MongoDB Atlas');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
};

const app = express();
app.use(express.json());
app.use(cookieParser());

// Middleware to ensure DB is connected
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

const PORT = 3000;

  // --- Auth Middleware ---
  const authenticateToken = (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Access denied' });

    try {
      const verified = jwt.verify(token, JWT_SECRET);
      req.user = verified;
      next();
    } catch (err) {
      res.status(400).json({ error: 'Invalid token' });
    }
  };

  // --- API Routes ---

  // Register
  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    
    try {
      const existingUser = await User.findOne({ email });
      if (existingUser) return res.status(400).json({ error: 'User already exists' });

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newUser = new User({
        name,
        email,
        password: hashedPassword,
        role: role || 'student'
      });

      await newUser.save();
      
      if (newUser.role === 'student') {
        const initialMastery = new Mastery({
          userId: newUser._id,
        });
        await initialMastery.save();
      }

      res.json({ message: 'User registered successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Login
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
      const user = await User.findOne({ email });
      if (!user) return res.status(400).json({ error: 'User not found' });

      const validPass = await bcrypt.compare(password, user.password);
      if (!validPass) return res.status(400).json({ error: 'Invalid password' });

      const token = jwt.sign({ id: user._id, email: user.email, role: user.role, name: user.name }, JWT_SECRET);
      res.cookie('token', token, { httpOnly: true });
      res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
  });

  // Get current user info
  app.get('/api/auth/me', authenticateToken, (req: any, res) => {
    res.json(req.user);
  });

  // --- ITS Tutoring Engine ---
  app.post('/api/tutoring/chat', authenticateToken, async (req: any, res) => {
    console.log('--- POST /api/tutoring/chat ---');
    const { message, history } = req.body;
    const userId = req.user.id;
    
    if (!process.env.GEMINI_API_KEY) {
      console.error('CRITICAL: GEMINI_API_KEY is not set in the environment.');
      return res.status(500).json({ error: 'AI Service configuration missing. Please check server logs.' });
    }

    try {
      let userMastery = await Mastery.findOne({ userId });
      if (!userMastery) {
        userMastery = new Mastery({ userId });
      }

      console.log(`User Mastery Level: ${userMastery.masteryLevel}`);

      const systemPrompt = `
SYSTEM ROLE: You are an Intelligent Tutoring System (ITS) designed for introductory programming education.
TARGET LEARNERS: Undergraduate students with little to no prior experience (Intro Python).
SCOPE: Variables and data types, Conditional statements, Loops, Basic functions.
LEARNER MODEL (EDM Simulation): 
- Current Mastery: ${userMastery.masteryLevel}
- Repeated Mistakes in this session: ${userMastery.repeatedMistakes.join(', ')}

RULES:
1. Diagnose the learner’s knowledge based on answers or code submissions.
2. Identify the type of learner error: Syntax, Logical, or Conceptual.
3. Explain WHY the learner’s answer is incorrect before suggesting improvement.
4. Do NOT immediately give the full solution.
5. Provide hints progressively.
6. Recommend what the learner should practice next.
7. Use clear, supportive language.
8. Adapt explanations if errors repeat.

RESPONSE FORMAT (MANDATORY):
Diagnosis: (Brief analysis)
Explanation: (Simple explanation)
Hint: (Gentle clue)
Example (if needed): (Short example)
Recommendation: (Next topic or activity)
[METADATA]: {"masteryUpdate": "Low/Medium/High", "identifiedMistake": "string or null"}
`;

      const contents = history.slice(-10).map((h: any) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
      }));
      
      // Ensure the last role is user if the message is coming in
      contents.push({ role: 'user', parts: [{ text: message }] });

      console.log('Calling Gemini API (gemini-1.5-flash)...');
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: contents,
        config: {
          systemInstruction: systemPrompt
        }
      });

      const responseText = response.text || '';
      console.log('Received response from Gemini.');

      // Parse metadata for EDM
      const metadataMatch = responseText.match(/\[METADATA\]: (.*)/);
      if (metadataMatch) {
        try {
          const metadataStr = metadataMatch[1];
          const metadata = JSON.parse(metadataStr);
          console.log('Parsed metadata:', metadata);

          if (metadata.masteryUpdate) userMastery.masteryLevel = metadata.masteryUpdate;
          if (metadata.identifiedMistake && !userMastery.repeatedMistakes.includes(metadata.identifiedMistake)) {
            userMastery.repeatedMistakes.push(metadata.identifiedMistake);
          }
          userMastery.history.push({ 
            timestamp: new Date(), 
            mistake: metadata.identifiedMistake,
            mastery: metadata.masteryUpdate
          });
          await userMastery.save();
          console.log('Updated user mastery in DB.');
        } catch (e) {
          console.error("Failed to parse metadata", e);
        }
      }

      const cleanText = responseText.replace(/\[METADATA\]: .*/, '').trim();
      res.json({ content: cleanText });
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      res.status(500).json({ error: error.message || 'Error communicating with AI service' });
    }
  });

  // This endpoint now only updates mastery metadata
  app.post('/api/tutoring/metadata', authenticateToken, async (req: any, res) => {
    console.log('POST /api/tutoring/metadata', req.body);
    const { metadata } = req.body;
    const userId = req.user.id;
    
    try {
      let userMastery = await Mastery.findOne({ userId });
      if (!userMastery) {
        userMastery = new Mastery({ userId });
      }

      if (metadata.masteryUpdate) userMastery.masteryLevel = metadata.masteryUpdate;
      if (metadata.identifiedMistake && !userMastery.repeatedMistakes.includes(metadata.identifiedMistake)) {
        userMastery.repeatedMistakes.push(metadata.identifiedMistake);
      }
      userMastery.history.push({ 
        timestamp: new Date(), 
        mistake: metadata.identifiedMistake,
        mastery: metadata.masteryUpdate
      });
      await userMastery.save();
      console.log('Mastery updated:', userMastery.masteryLevel);
      res.json({ success: true });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get mastery info for frontend prompting
  app.get('/api/tutoring/mastery', authenticateToken, async (req: any, res) => {
    console.log('GET /api/tutoring/mastery for user:', req.user.id);
    try {
      const userMastery = await Mastery.findOne({ userId: req.user.id });
      res.json(userMastery || { masteryLevel: 'Low', repeatedMistakes: [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Teacher/Admin Dashboard API ---
  app.get('/api/analytics/mastery', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    try {
      const students = await User.find({ role: 'student' });
      const studentIds = students.map(s => s._id);
      const masteries = await Mastery.find({ userId: { $in: studentIds } });

      const analytics = students.map(s => ({
        name: s.name,
        email: s.email,
        id: s._id,
        mastery: masteries.find(m => m.userId.toString() === s._id.toString()) || { masteryLevel: 'Unknown', repeatedMistakes: [], progress: 0, history: [] }
      }));
      res.json(analytics);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/users', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    try {
      const users = await User.find().select('-password');
      res.json(users);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  export default app;

