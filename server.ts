import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

// --- Process Handlers ---
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'its-prototype-secret-key';
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = 3000;

// --- MongoDB Schemas ---
const PedagogicalRuleSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  pattern: String,
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
  isUnknown: { type: Boolean, default: false }
});
const ResponseCache = mongoose.model('ResponseCache', ResponseCacheSchema);

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'teacher', 'admin'], default: 'student' },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

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
const Mastery = mongoose.model('Mastery', MasterySchema);

// --- MongoDB Connection ---
let isConnected = false;
const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) return;
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI not found.');
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('Connected to MongoDB Atlas');
    
    // Seed basic pedagogical rules if empty
    const ruleCount = await PedagogicalRule.countDocuments();
    if (ruleCount === 0) {
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
          explanation: 'Python relies on indentation to define blocks of code.',
          hint: 'Check if your code is aligned correctly.',
          priority: 7
        }
      ];
      await PedagogicalRule.insertMany(initialRules);
    }
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
};

// --- AI Service ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'fake-key');

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
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', systemInstruction: systemPrompt });
      const result = await model.generateContent(message);
      return result.response.text();
    } else if (['groq', 'perplexity', 'deepseek'].includes(provider)) {
      const client = getOpenAIClient(provider);
      if (!client) return null;
      let model = 'llama3-8b-8192';
      if (provider === 'perplexity') model = 'sonar-small-online';
      if (provider === 'deepseek') model = 'deepseek-chat';

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }]
      });
      return response.choices[0].message.content;
    }
  } catch (e: any) {
    console.error(`AI Provider (${provider}) Error:`, e.message);
    return null;
  }
  return null;
}

// --- Server Setup ---
async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use(async (_req, _res, next) => {
    await connectDB();
    next();
  });

  const authenticateToken = (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Access denied' });
    try {
      const verified = jwt.verify(token, JWT_SECRET);
      req.user = verified;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid or expired session' });
    }
  };

  // API Routes
  app.get('/api/health', (req, res) => res.json({ status: 'ok', db: mongoose.connection.readyState === 1 }));

  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
      const existing = await User.findOne({ email });
      if (existing) return res.status(400).json({ error: 'User exists' });
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({ name, email, password: hashedPassword, role: role || 'student' });
      await user.save();
      if (user.role === 'student') await new Mastery({ userId: user._id }).save();
      res.json({ message: 'Registered' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }
      const token = jwt.sign({ id: user._id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 86400000 });
      res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
  });

  app.get('/api/auth/me', authenticateToken, (req: any, res) => res.json(req.user));

  app.get('/api/tutoring/mastery', authenticateToken, async (req: any, res) => {
    const m = await Mastery.findOne({ userId: req.user.id });
    res.json(m || { masteryLevel: 'Low', repeatedMistakes: [] });
  });

  app.post('/api/tutoring/chat', authenticateToken, async (req: any, res) => {
    const { message, problemId } = req.body;
    const userId = req.user.id;
    const studentCode = (message || '').trim();

    try {
      let userMastery = await Mastery.findOne({ userId });
      if (!userMastery) { userMastery = await new Mastery({ userId }).save(); }

      const rules = await PedagogicalRule.find().sort({ priority: -1 });
      let matchedRule = null;
      for (const rule of rules) {
        if (!rule.pattern) continue;
        const regex = new RegExp(rule.pattern, 'm');
        if (regex.test(studentCode)) { matchedRule = rule; break; }
      }

      let responseText = "";
      let metadata = { masteryUpdate: userMastery.masteryLevel, identifiedMistake: "unknown" };

      if (matchedRule) {
        responseText = `Diagnosis: ${matchedRule.diagnosis}\nExplanation: ${matchedRule.explanation}\nHint: ${matchedRule.hint}`;
        metadata = { masteryUpdate: "Medium", identifiedMistake: matchedRule.id };
      } else {
        const cached = await ResponseCache.findOne({ problemId: problemId || 'general', studentCode });
        if (cached && !cached.isUnknown) {
          responseText = `Diagnosis: ${cached.diagnosis}\nExplanation: ${cached.explanation}\nHint: ${cached.hint}`;
          metadata.masteryUpdate = cached.masteryUpdate || "Low";
        } else {
          const aiResponse = await getAIResponse(studentCode, userMastery);
          if (aiResponse) {
            const m = aiResponse.match(/\[METADATA\]: (.*)/);
            responseText = aiResponse.replace(/\[METADATA\]: .*/, '').trim();
            if (m) {
              const p = JSON.parse(m[1]);
              metadata.masteryUpdate = p.masteryUpdate || "Low";
              metadata.identifiedMistake = p.identifiedMistake || "ai";
              await ResponseCache.create({
                problemId: problemId || 'general', studentCode, 
                diagnosis: responseText.match(/Diagnosis: (.*)/)?.[1] || '',
                explanation: responseText.match(/Explanation: (.*)/)?.[1] || '',
                hint: responseText.match(/Hint: (.*)/)?.[1] || '',
                masteryUpdate: metadata.masteryUpdate
              });
            }
          } else {
            responseText = "Diagnosis: Unknown\nExplanation: No pattern identified.\nHint: Check indentation.";
          }
        }
      }

      userMastery.masteryLevel = metadata.masteryUpdate;
      if (metadata.identifiedMistake && !userMastery.repeatedMistakes.includes(metadata.identifiedMistake)) {
        userMastery.repeatedMistakes.push(metadata.identifiedMistake);
      }
      userMastery.history.push({ timestamp: new Date(), mistake: metadata.identifiedMistake, mastery: metadata.masteryUpdate });
      await userMastery.save();

      res.json({ content: responseText });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Admin/Teacher
  app.get('/api/analytics/mastery', authenticateToken, async (req: any, res: any) => {
    if (['teacher', 'admin'].includes(req.user.role)) {
      const students = await User.find({ role: 'student' });
      const analytics = await Promise.all(students.map(async s => ({
        name: s.name, email: s.email, mastery: await Mastery.findOne({ userId: s._id })
      })));
      res.json(analytics);
    } else res.status(403).send('Forbidden');
  });

  // Vite
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => res.sendFile(path.resolve('dist', 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));
}

startServer();
