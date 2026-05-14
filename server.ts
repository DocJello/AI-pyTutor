import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'its-prototype-secret-key';
const MONGODB_URI = process.env.MONGODB_URI;

// --- MongoDB Schemas ---
const PedagogicalRuleSchema = new mongoose.Schema({
  id: { type: String, unique: true }, // e.g. 'missing_colon_if'
  pattern: String, // Regex or keyword
  type: { type: String, enum: ['regex', 'keyword'], default: 'keyword' },
  diagnosis: String,
  explanation: String,
  hint: String,
  priority: { type: Number, default: 0 }
});

const PedagogicalRule = mongoose.model('PedagogicalRule', PedagogicalRuleSchema);

const ResponseCacheSchema = new mongoose.Schema({
  problemId: String,
  studentCode: String,
  diagnosis: String,
  explanation: String,
  hint: String,
  masteryUpdate: String,
  isUnknown: { type: Boolean, default: false } // Flag for teacher to review
});

const ResponseCache = mongoose.model('ResponseCache', ResponseCacheSchema);

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
    
    // Seed basic pedagogical rules if empty
    const ruleCount = await PedagogicalRule.countDocuments();
    if (ruleCount === 0) {
      console.log('Seeding initial pedagogical rules...');
      const initialRules = [
        {
          id: 'missing_colon',
          pattern: '(if|for|while|def)(?!.*:).*$',
          type: 'regex',
          diagnosis: 'Syntax Error (Missing Colon)',
          explanation: 'In Python, control structures like if-statements, for-loops, and function definitions MUST end with a colon (:).',
          hint: 'Look at the end of your conditional or loop line. Is there a colon there?',
          priority: 10
        },
        {
          id: 'single_equals',
          pattern: 'if.*[^=]=[^=].*:',
          type: 'regex',
          diagnosis: 'Logical/Syntax Error (Assignment vs Comparison)',
          explanation: 'You are using a single "=" inside an if-statement. In Python, "=" is for assigning values, but "==" is used to compare them.',
          hint: 'Check your comparison inside the if-statement. Use double equals (==) to check for equality.',
          priority: 9
        },
        {
          id: 'print_no_parens',
          pattern: 'print ["\'].*["\']',
          type: 'regex',
          diagnosis: 'Syntax Error (Python 3 Print)',
          explanation: 'In Python 3, print is a function and requires parentheses around its arguments.',
          hint: 'Try wrapping what you want to output in parentheses, like print("hello").',
          priority: 8
        },
        {
          id: 'indentation_basic',
          pattern: '^[ ]+(if|for|while|def)',
          type: 'regex',
          diagnosis: 'Indentation Error',
          explanation: 'Python relies on indentation to define blocks of code. Unexpected spaces at the start of a line can confuse the interpreter.',
          hint: 'Check if your code is aligned correctly. Only indent lines that are INSIDE a block (like an if-statement).',
          priority: 7
        }
      ];
      await PedagogicalRule.insertMany(initialRules);
    }
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
};

// Initialize Rule Engine (No AI needed)
// Initialize AI Clients
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'fake-key' });

const getOpenAIClient = (provider: string) => {
  let apiKey = '';
  let baseURL = '';

  if (provider === 'groq') {
    apiKey = process.env.GROQ_API_KEY || '';
    baseURL = 'https://api.groq.com/openai/v1';
  } else if (provider === 'perplexity') {
    apiKey = process.env.PERPLEXITY_API_KEY || '';
    baseURL = 'https://api.perplexity.ai';
  } else if (provider === 'deepseek') {
    apiKey = process.env.DEEPSEEK_API_KEY || '';
    baseURL = 'https://api.deepseek.com';
  }
  
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
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
    if (!token) {
      console.warn('[AUTH] Missing token cookie');
      return res.status(401).json({ error: 'Access denied' });
    }

    try {
      const verified = jwt.verify(token, JWT_SECRET);
      req.user = verified;
      next();
    } catch (err) {
      console.error('[AUTH] Token verification failed:', err);
      res.status(401).json({ error: 'Invalid or expired session' });
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

      const token = jwt.sign({ id: user._id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
      res.cookie('token', token, { 
        httpOnly: true, 
        secure: true, 
        sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
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

  // --- ITS Records Management ---
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

  // --- Tutoring Logic Helpers ---
  async function getAIResponse(message: string, userMastery: any) {
    const provider = process.env.TUTOR_AI_PROVIDER || 'gemini';
    const systemPrompt = `
SYSTEM ROLE: You are an Intelligent Tutoring System (ITS) for Python.
TARGET LEARNERS: Beginners.
LEARNER MODEL: Current Mastery=${userMastery.masteryLevel}, Recent Mistakes=${userMastery.repeatedMistakes?.join(', ') || 'None'}.

RULES:
1. Diagnose the learner’s error (Syntax, Logical, or Conceptual).
2. Explain WHY it is wrong.
3. Provide a scaffolded hint (no direct solution).
4. Use supportive language.

RESPONSE FORMAT (MANDATORY):
Diagnosis: (Analysis)
Explanation: (The 'why')
Hint: (Scaffold)
[METADATA]: {"masteryUpdate": "Low/Medium/High", "identifiedMistake": "string or null"}
`;

    if (provider === 'rule-only') return null;

    try {
      if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
        const response = await (ai as any).models.generateContent({
          model: 'gemini-1.5-flash',
          contents: [{ role: 'user', parts: [{ text: message }] }],
          config: {
            systemInstruction: systemPrompt
          }
        });
        return response.text || '';
      } else if (provider === 'groq' || provider === 'perplexity' || provider === 'deepseek') {
        const client = getOpenAIClient(provider);
        if (!client) throw new Error(`API Key for ${provider} is missing.`);
        
        let model = 'llama3-8b-8192'; // Standard Groq free model
        if (provider === 'perplexity') model = 'sonar-small-online';
        if (provider === 'deepseek') model = 'deepseek-chat';

        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ]
        });
        return response.choices[0].message.content;
      }
    } catch (e: any) {
      console.error(`AI Provider (${provider}) Error:`, e.message);
      return null;
    }
    return null;
  }

  // --- ITS Tutoring Engine ---
  app.post('/api/tutoring/chat', authenticateToken, async (req: any, res) => {
    const { message, problemId } = req.body;
    const userId = req.user.id;
    const studentCode = (message || '').trim();

    if (!studentCode) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    try {
      // 1. Fetch/Create User Mastery
      let userMastery = await Mastery.findOne({ userId });
      if (!userMastery) {
        userMastery = new Mastery({ userId });
        await userMastery.save();
      }

      // 2. Check Static Rules (Free & Instant)
      const rules = await PedagogicalRule.find().sort({ priority: -1 });
      let matchedRule = null;

      for (const rule of rules) {
        if (!rule.pattern) continue;
        try {
          if (rule.type === 'regex') {
            const regex = new RegExp(rule.pattern, 'm');
            if (regex.test(studentCode)) { matchedRule = rule; break; }
          } else if (rule.type === 'keyword') {
            if (studentCode.includes(rule.pattern)) { matchedRule = rule; break; }
          }
        } catch (re) { console.error("Regex eval error:", re); }
      }

      let responseText = "";
      let metadata = { masteryUpdate: userMastery.masteryLevel || "Low", identifiedMistake: "unknown" };

      if (matchedRule) {
        console.log(`[ITS] Rule Match: ${matchedRule.id}`);
        responseText = `Diagnosis: ${matchedRule.diagnosis}\nExplanation: ${matchedRule.explanation}\nHint: ${matchedRule.hint}`;
        metadata = { masteryUpdate: "Medium", identifiedMistake: matchedRule.id };
      } else {
        // 3. Check Response Cache (if someone else already asked this)
        const cached = await ResponseCache.findOne({ 
          problemId: problemId || 'general', 
          studentCode 
        });

        if (cached && !cached.isUnknown) {
          console.log(`[ITS] Cache Hit`);
          responseText = `Diagnosis: ${cached.diagnosis}\nExplanation: ${cached.explanation}\nHint: ${cached.hint}`;
          metadata.masteryUpdate = cached.masteryUpdate || "Low";
        } else {
          // 4. Call AI (Gemini/Perplexity/DeepSeek)
          console.log(`[ITS] Calling AI Provider...`);
          const aiResponse = await getAIResponse(studentCode, userMastery);

          if (aiResponse) {
            const metadataMatch = aiResponse.match(/\[METADATA\]: (.*)/);
            responseText = aiResponse.replace(/\[METADATA\]: .*/, '').trim();
            
            if (metadataMatch) {
              try {
                const parsed = JSON.parse(metadataMatch[1]);
                metadata.masteryUpdate = parsed.masteryUpdate || "Low";
                metadata.identifiedMistake = parsed.identifiedMistake || "ai_generated";

                // Update Cache
                const diagnosis = responseText.match(/Diagnosis: (.*)/s)?.[1]?.split('\n')[0] || '';
                const explanation = responseText.match(/Explanation: (.*)/s)?.[1]?.split('\n')[0] || '';
                const hint = responseText.match(/Hint: (.*)/s)?.[1]?.split('\n')[0] || '';

                await ResponseCache.create({
                  problemId: problemId || 'general',
                  studentCode,
                  diagnosis,
                  explanation,
                  hint,
                  masteryUpdate: metadata.masteryUpdate,
                  isUnknown: false
                });
              } catch (e) { console.error("Metadata Parse Error", e); }
            }
          } else {
            // 5. Fallback if AI fails or Rule-Only
            console.log(`[ITS] Fallback guidance`);
            responseText = `Diagnosis: Pattern Unknown\nExplanation: I couldn't identify a specific error pattern in your code immediately.\nHint: Re-read the instructions. Common issues include typos in variable names or misplaced indentation.`;
            
            // Log as unknown for teacher review
            await ResponseCache.updateOne(
              { problemId: problemId || 'general', studentCode },
              { $set: { isUnknown: true } },
              { upsert: true }
            );
          }
        }
      }

      // Update User Mastery State
      userMastery.masteryLevel = metadata.masteryUpdate;
      if (metadata.identifiedMistake && !userMastery.repeatedMistakes.includes(metadata.identifiedMistake)) {
        userMastery.repeatedMistakes.push(metadata.identifiedMistake);
      }
      userMastery.history.push({ 
        timestamp: new Date(), 
        mistake: metadata.identifiedMistake,
        mastery: metadata.masteryUpdate
      });
      await userMastery.save();

      res.json({ content: responseText, provider: process.env.TUTOR_AI_PROVIDER || 'local' });

    } catch (error: any) {
      console.error('ITS Controller Error:', error);
      res.status(500).json({ error: 'Tutoring system encountered an internal conflict. Please refresh.' });
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

