import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { UserPlus } from 'lucide-react';

const RegisterPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      });
      
      let data;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || 'Server returned an invalid response');
      }

      if (res.ok) {
        navigate('/login');
      } else {
        setError(data.error || 'Registration failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center -mt-16">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-xl mb-4">
            <UserPlus size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create Account</h1>
          <p className="text-slate-500 text-sm mt-2">Join the Intelligent Tutoring System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <input 
              type="text" 
              required 
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Academic Email</label>
            <input 
              type="email" 
              required 
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. j.doe@academic.edu"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select 
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all appearance-none"
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input 
              type="password" 
              required 
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button 
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-md shadow-indigo-200"
          >
            Create Account
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          Already registered? <Link to="/login" className="text-indigo-600 font-medium hover:underline">Sign in instead</Link>
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
