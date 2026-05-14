import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, AlertCircle, CheckCircle2, Info, ArrowRight, BrainCircuit } from 'lucide-react';
import { useAuth } from '../App';

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
    if (!text.trim() || isTyping) return;
    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/tutoring/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          message: text,
          problemId: 'intro_python_1'
        }),
      });

      let data;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const textResponse = await res.text();
        throw new Error(textResponse || 'Server error');
      }
      
      if (res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
        
        // Refresh local mastery state
        fetch('/api/tutoring/mastery')
          .then(r => r.ok ? r.json() : null)
          .then(m => m && setMastery(m));
      } else {
        throw new Error(data.error || 'Server error');
      }
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: `Diagnosis: System Busy\nExplanation: ${err.message}\nHint: The AI tutor is handling many requests. Please wait a moment before trying again.` }]);
    } finally {
      setIsTyping(false);
    }
  };

  const parseContent = (content: string) => {
    const lines = content.split('\n');
    const sections: { label: string; text: string }[] = [];
    let currentSection: { label: string; text: string } | null = null;

    lines.forEach(line => {
      const match = line.match(/^(Diagnosis|Explanation|Hint|Example|Recommendation|Summary):\s*(.*)/i);
      if (match) {
        if (currentSection) sections.push(currentSection);
        currentSection = { label: match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase(), text: match[2] };
      } else if (currentSection) {
        currentSection.text += (currentSection.text ? '\n' : '') + line;
      } else if (line.trim()) {
        sections.push({ label: 'General', text: line });
      }
    });
    if (currentSection) sections.push(currentSection);

    return sections.map((sec, idx) => {
      const { label, text } = sec;

      if (label === 'Diagnosis') return (
        <div key={idx} className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-xl shadow-sm">
          <div className="flex items-center gap-2 text-blue-800 font-bold text-xs mb-2 uppercase tracking-widest">
            <Info size={14}/> Diagnosis
          </div>
          <p className="text-sm md:text-base text-blue-900 font-medium leading-relaxed">{text}</p>
        </div>
      );
      
      if (label === 'Explanation') return (
        <div key={idx} className="mb-6 mt-4">
          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
            <BrainCircuit size={14} className="text-indigo-400" /> Pedagogical Explainer
          </h4>
          <div className="text-slate-700 leading-relaxed text-sm md:text-base space-y-2">
            {text.split('\n').map((para, i) => <p key={i}>{para}</p>)}
          </div>
        </div>
      );
      
      if (label === 'Hint') return (
        <div key={idx} className="mb-4 p-4 bg-amber-50 border-l-4 border-amber-400 rounded-r-xl shadow-sm border border-amber-100/50">
          <div className="flex items-center gap-2 text-amber-800 font-bold text-xs mb-2 uppercase tracking-widest">
            <Sparkles size={14}/> Hint
          </div>
          <p className="text-sm md:text-base text-amber-900 italic font-semibold leading-relaxed">{text}</p>
        </div>
      );
      
      if (label === 'Example') return (
        <div key={idx} className="mb-6 p-5 bg-slate-900 rounded-2xl font-mono text-sm text-indigo-100 shadow-xl border border-slate-800 overflow-x-auto ring-1 ring-white/10">
          <div className="flex items-center gap-2 text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-3 border-b border-slate-800 pb-2">
            Code Example
          </div>
          <code className="whitespace-pre">{text}</code>
        </div>
      );
      
      if (label === 'Recommendation') return (
        <div key={idx} className="mt-8 mb-4 p-5 bg-gradient-to-br from-indigo-50/50 to-violet-50/50 border border-indigo-100/50 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <ArrowRight size={40} className="text-indigo-600" />
          </div>
          <div className="flex items-center gap-2 text-indigo-800 font-black text-xs mb-3 uppercase tracking-[0.15em]">
             Next Step
          </div>
          <p className="text-sm md:text-base text-indigo-900 font-bold leading-relaxed">{text}</p>
        </div>
      );
      
      return <p key={idx} className="mb-4 text-slate-600 font-sans leading-relaxed text-sm md:text-base">{text}</p>;
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
        <div className="relative flex items-end gap-2 group">
          <textarea 
            rows={Math.min(6, Math.max(1, input.split('\n').length))}
            className="w-full pl-6 pr-14 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 shadow-inner resize-none font-mono text-sm leading-relaxed"
            placeholder="Type your answer or code here... (Shift+Enter for new line)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleChat(input);
              }
            }}
            disabled={isTyping}
          />
          <button 
            onClick={() => handleChat(input)}
            disabled={!input.trim() || isTyping}
            className="absolute right-2.5 bottom-2.5 p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-lg active:scale-95 group-focus-within:ring-2 ring-indigo-200"
          >
            <Send size={20} />
          </button>
        </div>
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
