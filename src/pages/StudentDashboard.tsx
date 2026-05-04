import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, AlertCircle, CheckCircle2, Info, ArrowRight, BrainCircuit } from 'lucide-react';
import { useAuth } from '../App';
import { GoogleGenAI } from '@google/genai';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const StudentDashboard = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [mastery, setMastery] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    // Fetch current mastery for context
    fetch('/api/tutoring/mastery')
      .then(res => res.json())
      .then(data => setMastery(data));
    
    // Initial diagnostic prompt if empty
    if (messages.length === 0) {
      handleChat('I am ready to begin my introductory Python programming lesson.');
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleChat = async (text: string) => {
    if (!text.trim()) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/tutoring/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text,
          history: newMessages.slice(-10) 
        }),
      });

      const data = await res.json();
      
      if (res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
        
        // Refresh local mastery state
        fetch('/api/tutoring/mastery')
          .then(r => r.json())
          .then(m => setMastery(m));
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: `Diagnosis: AI Connection Error\nExplanation: ${err.message}\nHint: Check your API key or connection.` }]);
    } finally {
      setIsTyping(false);
    }
  };

  const parseContent = (content: string) => {
    const sections = content.split('\n');
    return sections.map((section, idx) => {
      const [label, ...rest] = section.split(': ');
      const text = rest.join(': ');

      if (label === 'Diagnosis') return <div key={idx} className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg"><div className="flex items-center gap-2 text-blue-800 font-bold text-xs mb-1 uppercase tracking-wider"><Info size={14}/> Diagnosis</div><p className="text-sm text-blue-900">{text}</p></div>;
      if (label === 'Explanation') return <div key={idx} className="mb-4 text-slate-700 leading-relaxed"><h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Pedagogical Explainer</h4><p className="text-base font-medium">{text || section}</p></div>;
      if (label === 'Hint') return <div key={idx} className="mb-4 p-3 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg"><div className="flex items-center gap-2 text-amber-800 font-bold text-xs mb-1 uppercase tracking-wider"><Sparkles size={14}/> Hint</div><p className="text-sm text-amber-900 italic font-medium">{text}</p></div>;
      if (label === 'Example') return <div key={idx} className="mb-4 p-4 bg-slate-900 rounded-xl font-mono text-sm text-slate-100 shadow-inner overflow-x-auto"><code>{text || section.replace('Example:', '').trim()}</code></div>;
      if (label === 'Recommendation') return <div key={idx} className="mt-6 mb-4 p-4 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl shadow-sm"><div className="flex items-center gap-2 text-indigo-800 font-bold text-xs mb-2 uppercase tracking-wider"><ArrowRight size={14}/> Recommendation</div><p className="text-sm text-indigo-900 font-semibold">{text}</p></div>;
      
      return <p key={idx} className="mb-2 text-slate-600 font-sans">{section}</p>;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
      {/* Chat Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100">
            <BrainCircuit size={20} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 tracking-tight">Python AI Tutor</h2>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${
                mastery?.masteryLevel === 'High' ? 'bg-emerald-100 text-emerald-700' :
                mastery?.masteryLevel === 'Medium' ? 'bg-amber-100 text-amber-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                Mastery: {mastery?.masteryLevel || 'Low'}
              </span>
              <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Knowledge Engineering Active</p>
            </div>
          </div>
        </div>
      </div>

      {/* Message Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 bg-[grid:slate-50_1px_transparent_0] [background-size:20px_20px]"
      >
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] ${m.role === 'user' ? 'bg-indigo-600 text-white px-6 py-3 rounded-2xl rounded-tr-none shadow-lg shadow-indigo-100' : 'w-full'}`}>
                {m.role === 'user' ? (
                  <p className="text-sm md:text-base font-medium">{m.content}</p>
                ) : (
                  <div className="bg-white/80 backdrop-blur-sm border border-slate-200 p-6 rounded-2xl rounded-tl-none shadow-sm ring-1 ring-slate-100">
                    {parseContent(m.content)}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {isTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl rounded-tl-none flex gap-1.5 items-center">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce"></span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-50/80 backdrop-blur-md border-t border-slate-100">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleChat(input); }}
          className="relative flex items-center group"
        >
          <input 
            type="text"
            className="w-full pl-6 pr-14 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 shadow-inner"
            placeholder="Type your answer or code here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
          />
          <button 
            type="submit"
            disabled={!input.trim() || isTyping}
            className="absolute right-2.5 p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-lg active:scale-95 group-focus-within:ring-2 ring-indigo-200"
          >
            <Send size={20} />
          </button>
        </form>
        <div className="flex justify-center gap-6 mt-3">
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
            Prototype EDU-ITS
          </p>
          <span className="w-1 h-1 bg-slate-200 rounded-full mt-1"></span>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
            V 1.0.4 - Research Stable
          </p>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
