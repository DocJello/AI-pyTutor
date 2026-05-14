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
    if (ruleCount < 6) {
      const initialRules = [
        { id: 'greeting', pattern: '.*\\b(hi|hello|hey|ready|begin|start|morning|afternoon|evening)\\b.*', type: 'regex', diagnosis: 'General Greeting', explanation: 'Welcome to the Python Intelligent Tutoring System! I am here to help you learn Python step-by-step. What would you like to build today?', hint: 'Try writing a simple print statement to start, like: print("Hello World")', priority: 100 },
        { id: 'multiple_statements', pattern: '[a-zA-Z_]\\w*\\s*=\\s*[^\\n;]+[ \\t]+[a-zA-Z_]\\w*\\s*=', type: 'regex', diagnosis: 'Syntax Error (Multiple Statements)', explanation: 'You seem to have multiple statements on the same line without a separator. In Python, each statement should typically be on its own line, or separated by a semicolon (;).', hint: 'Try putting "b = 33" on a new line after "a = 33".', priority: 11 },
        { id: 'missing_colon', pattern: '(if|for|while|def)(?!.*:).*$', type: 'regex', diagnosis: 'Syntax Error (Missing Colon)', explanation: 'In Python, control structures like if-statements, for-loops, and function definitions MUST end with a colon (:).', hint: 'Look at the end of your conditional or loop line. Is there a colon there?', priority: 10 },
        { id: 'single_equals', pattern: 'if.*[^=]=[^=].*:', type: 'regex', diagnosis: 'Logical/Syntax Error (Assignment vs Comparison)', explanation: 'You are using a single "=" inside an if-statement. In Python, "=" is for assigning values, but "==" is used to compare them.', hint: 'Check your comparison inside the if-statement. Use double equals (==) to check for equality.', priority: 9 },
        { id: 'print_no_parens', pattern: 'print ["\'].*["\']', type: 'regex', diagnosis: 'Syntax Error (Python 3 Print)', explanation: 'In Python 3, print is a function and requires parentheses around its arguments.', hint: 'Try wrapping what you want to output in parentheses, like print("hello").', priority: 8 },
        { id: 'indentation_basic', pattern: '^[ ]+(if|for|while|def)', type: 'regex', diagnosis: 'Indentation Error', explanation: 'Python relies on indentation to define blocks of code.', hint: 'Check if your code is aligned correctly.', priority: 7 }
      ];
      
      for (const rule of initialRules) {
        await PedagogicalRule.updateOne({ id: rule.id }, { $set: rule }, { upsert: true });
      }
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
  const apiKey = process.env.GEMINI_API_KEY;

  const systemPrompt = `
SYSTEM ROLE: You are an Intelligent Tutoring System (ITS) for Python.
TARGET LEARNERS: Beginners learning Python programming.
LEARNER MODEL: Current Mastery=${userMastery.masteryLevel}, Recent Mistakes=${userMastery.repeatedMistakes?.join(', ') || 'None'}.

CORE TASKS:
1. Diagnose any errors (Syntax, Logical, Conceptual) in code provided.
2. Explain WHY the error persists according to Python language rules.
3. Provide a helpful hint or scaffolded advice (DO NOT provide direct code solutions).
4. Maintain a supportive, encouraging, and pedagogical tone.

RESPONSE FORMAT (MANDATORY):
Diagnosis: <Text>
Explanation: <Detailed Text>
Hint: <Actionable Scaffold>
[METADATA]: {"masteryUpdate": "Low/Medium/High", "identifiedMistake": "string_id_or_null"}
`;

  if (provider === 'rule-only') {
    console.log('[AI] Rule-only mode active');
    return null;
  }

  try {
    if (provider === 'gemini') {
      if (!apiKey) {
        console.error('[AI] Gemini API Key missing from environment');
        return null;
      }
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash', 
        systemInstruction: systemPrompt 
      });
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        }
      });
      
      const text = result.response.text();
      console.log('[AI] Gemini Response Success');
      return text;
    } else if (['groq', 'perplexity', 'deepseek'].includes(provider)) {
      const client = getOpenAIClient(provider);
      if (!client) {
        console.error(`[AI] Client for ${provider} could not be initialized`);
        return null;
      }
      let model = 'llama3-8b-8192';
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
    console.error(`[AI] Provider (${provider}) Error:`, e.message);
    return null;
  }
  return null;
}

// --- Auth Middleware ---
const app = express();

// Middleware to ensure DB is connected
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
  } catch (err) {
    console.error('DB connection failed in middleware:', err);
  }
  next();
});

app.use(express.json());
app.use(cookieParser());

async function startServer() {
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
            const metaRegex = /\[METADATA\]:\s*(\{.*\})/;
            const metaMatch = aiResponse.match(metaRegex);
            responseText = aiResponse.replace(metaRegex, '').trim();

            if (metaMatch) {
              try {
                const p = JSON.parse(metaMatch[1]);
                metadata.masteryUpdate = p.masteryUpdate || userMastery.masteryLevel;
                metadata.identifiedMistake = p.identifiedMistake || "ai_generated";
              } catch (e) {
                console.warn('[AI] Metadata parse failed');
              }
            }
            
            // Cache parsing for future optimization
            const diag = responseText.match(/Diagnosis:\s*(.*?)(?=\nExplanation:|\nHint:|$)/si)?.[1] || 'Code Analysis';
            const expl = responseText.match(/Explanation:\s*(.*?)(?=\nHint:|$)/si)?.[1] || responseText;
            const hint = responseText.match(/Hint:\s*(.*)/si)?.[1] || 'Review your code logic and try again.';

            await ResponseCache.create({
              problemId: problemId || 'general',
              studentCode,
              diagnosis: diag.trim(),
              explanation: expl.trim(),
              hint: hint.trim(),
              masteryUpdate: metadata.masteryUpdate
            });
          } else {
            responseText = "Diagnosis: Intelligent Tutoring System Guidance\nExplanation: My full reasoning engine is currently unavailable, but I suggest checking your code for common Python syntax patterns like indentation, colons, or parentheses.\nHint: If you're stuck, try breaking your code into smaller segments.";
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
    // In production, this file is bundled to dist/server.cjs
    // So __dirname will be the absolute path to the 'dist' folder
    const distPath = path.resolve(__dirname, process.env.ESBUILD_BUNDLE ? '.' : 'dist');
    console.log(`[PROD] Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer().catch(err => {
  console.error('[CRITICAL] Failed to start server:', err);
});

export default app;
