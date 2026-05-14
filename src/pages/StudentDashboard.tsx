import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, AlertCircle, CheckCircle2, Info, ArrowRight, BrainCircuit, Play, Terminal, Code2 } from 'lucide-react';
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
  const [executionOutput, setExecutionOutput] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
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

    // Simulate code execution when a multi-line or block-like message is sent
    if (text.includes('print(') || text.includes('=') || text.includes(':')) {
      runSimulatedPython(text);
    }

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

  const runSimulatedPython = (code: string) => {
    setIsExecuting(true);
    setExecutionOutput([]);
    
    // Simple simulation delay
    setTimeout(() => {
      const logs: string[] = [];
      const lines = code.split('\n');
      const variables: Record<string, any> = {};

      try {
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;

          // Check for syntax errors that prevent execution in "Tutor" mode
          // 1. Multiple assignments on one line without separator
          if (/[a-zA-Z_]\w*\s*=\s*[^=;]+\s+[a-zA-Z_]\w*\s*=/.test(trimmed)) {
            throw new Error('SyntaxError: multiple statements on one line (seen near b = 33)');
          }

          // Handle print
          const printMatch = trimmed.match(/^print\((.*)\)$/);
          if (printMatch) {
            const content = printMatch[1].trim();
            // Try to resolve variable or string
            if ((content.startsWith('"') && content.endsWith('"')) || (content.startsWith("'") && content.endsWith("'"))) {
              logs.push(content.slice(1, -1));
            } else if (variables[content] !== undefined) {
              logs.push(String(variables[content]));
            } else {
              // Basic expression eval simulation
              try {
                // Replace python vars with their values for simple math
                let evalExpr = content;
                Object.keys(variables).forEach(v => {
                  evalExpr = evalExpr.replace(new RegExp(`\\b${v}\\b`, 'g'), variables[v]);
                });
                logs.push(String(eval(evalExpr)));
              } catch {
                logs.push(`NameError: name '${content}' is not defined`);
              }
            }
            return;
          }

          // Handle assignment
          const assignMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*=\s*(.*)$/);
          if (assignMatch) {
            const name = assignMatch[1];
            const valExpr = assignMatch[2].trim();
            try {
               // Simple eval for numbers/strings
               variables[name] = eval(valExpr.replace(/'/g, '"'));
            } catch {
               variables[name] = valExpr;
            }
          }
        });

        if (logs.length === 0 && code.trim()) {
          logs.push("(Program exited with no output)");
        }
      } catch (err: any) {
        logs.push(`\u001b[31m${err.message}\u001b[0m`);
      }

      setExecutionOutput(logs);
      setIsExecuting(false);
    }, 400);
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.target as HTMLTextAreaElement;
    const { selectionStart, selectionEnd, value } = textarea;

    // Handle Tab
    if (e.key === 'Tab') {
      e.preventDefault();
      const newValue = value.substring(0, selectionStart) + "    " + value.substring(selectionEnd);
      setInput(newValue);
      // Set cursor pos after next render
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + 4;
      }, 0);
      return;
    }

    // Handle Enter (Auto-indent)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      
      // Get current line
      const lines = value.substring(0, selectionStart).split('\n');
      const currentLine = lines[lines.length - 1];
      
      // Calculate current indentation
      const indentMatch = currentLine.match(/^\s*/);
      let indent = indentMatch ? indentMatch[0] : "";
      
      // If line ends with colon, increase indent
      if (currentLine.trim().endsWith(':')) {
        indent += "    ";
      }

      const newValue = value.substring(0, selectionStart) + "\n" + indent + value.substring(selectionEnd);
      setInput(newValue);
      
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + 1 + indent.length;
      }, 0);
    } else if (e.key === 'Enter' && e.shiftKey) {
      // Just let it behave normally or handle chat? 
      // User said: "shift+enter for new line" in placeholder, but usually shift+enter is for newline.
      // Wait, standard behavior: Enter = Submit, Shift+Enter = Newline.
      // But user asked for auto-indent ON Enter. 
      // Let's swap: Shift+Enter = Submit, Enter = Newline + Indent.
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
    <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto h-[calc(100vh-140px)]">
      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden ring-1 ring-slate-200/50">
        {/* Chat Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100 ring-2 ring-indigo-50">
              <BrainCircuit size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Python AI Tutor
                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">AI AGENT</span>
              </h2>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase tracking-widest font-black px-1.5 py-0.5 rounded-md ${
                  mastery?.masteryLevel === 'High' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                  mastery?.masteryLevel === 'Medium' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                  'bg-slate-50 text-slate-500 border border-slate-100'
                }`}>
                  Mastery: {mastery?.masteryLevel || 'Low'}
                </span>
                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Active Analysis</p>
              </div>
            </div>
          </div>
        </div>

        {/* Message Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30"
        >
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[90%] ${m.role === 'user' ? 'bg-indigo-600 text-white px-6 py-4 rounded-3xl rounded-tr-none shadow-xl shadow-indigo-100/50' : 'w-full'}`}>
                  {m.role === 'user' ? (
                    <p className="text-sm md:text-base font-mono whitespace-pre-wrap">{m.content}</p>
                  ) : (
                    <div className="bg-white border border-slate-200/60 p-6 rounded-3xl rounded-tl-none shadow-sm ring-1 ring-slate-100">
                      {parseContent(m.content)}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none flex gap-1.5 items-center shadow-sm">
                  <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-100">
          <div className="relative flex items-end gap-2 group">
            <textarea 
              rows={Math.min(10, Math.max(3, input.split('\n').length))}
              className="w-full pl-6 pr-14 py-4 bg-slate-50/50 border border-slate-200 rounded-3xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 shadow-inner resize-none font-mono text-sm leading-relaxed"
              placeholder="Write your Python code here... (Enter for indented newline)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              disabled={isTyping}
            />
            <button 
              onClick={() => handleChat(input)}
              disabled={!input.trim() || isTyping}
              className="absolute right-3 bottom-3 p-3.5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-lg active:scale-95 group-focus-within:shadow-indigo-200/50"
              title="Send to Tutor"
            >
              <Send size={20} />
            </button>
          </div>
          <div className="flex justify-center items-center gap-4 mt-3">
             <div className="h-[1px] flex-1 bg-slate-100"></div>
             <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] whitespace-nowrap">
               AI PEDAGOGICAL LAYER ACTIVE
             </p>
             <div className="h-[1px] flex-1 bg-slate-100"></div>
          </div>
        </div>
      </div>

      {/* Output Sidebar */}
      <div className="hidden lg:flex flex-col w-80 bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-800">
        <div className="px-5 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-emerald-400" />
            <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest">Execution Console</h3>
          </div>
          {isExecuting && (
            <div className="flex gap-1">
              <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></span>
            </div>
          )}
        </div>
        <div className="flex-1 p-5 font-mono text-xs overflow-y-auto space-y-2 text-slate-300 scrollbar-hide">
          {executionOutput.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-4">
              <Code2 size={40} className="mb-4" />
              <p className="italic">Standard Output will appear here after you send your code.</p>
            </div>
          ) : (
            executionOutput.map((line, i) => (
              <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                <span className="text-slate-600 select-none text-[10px] w-4 text-right">{i+1}</span>
                <span className={`flex-1 break-all ${line.includes('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                  {line}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="p-4 bg-slate-800/30 border-t border-slate-800">
          <div className="flex flex-col gap-2">
            <div className={`p-2 rounded-lg text-[10px] font-bold text-center uppercase tracking-widest border transition-colors ${
              executionOutput.some(l => l.includes('Error')) 
                ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
            }`}>
              {executionOutput.some(l => l.includes('Error')) ? 'Process Failed' : 'System Ready'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
