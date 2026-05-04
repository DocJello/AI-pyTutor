import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Users, GraduationCap, TrendingUp, AlertTriangle, Search, Filter, Mail, User as UserIcon } from 'lucide-react';

interface StudentAnalytics {
  id: string;
  name: string;
  email: string;
  mastery: {
    masteryLevel: 'Low' | 'Medium' | 'High' | 'Unknown';
    repeatedMistakes: string[];
    progress: number;
    history: any[];
  }
}

const TeacherDashboard = () => {
  const [students, setStudents] = useState<StudentAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetch('/api/analytics/mastery')
      .then(res => res.json())
      .then(data => {
        setStudents(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getMasteryColor = (level: string) => {
    switch (level) {
      case 'High': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Low': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="animate-pulse">Loading Analytics...</div>;

  return (
    <div className="space-y-8">
      {/* Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Students', value: students.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Avg Mastery', value: 'Medium', icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'At Risk', value: students.filter(s => s.mastery.masteryLevel === 'Low').length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Total Sessions', value: students.reduce((acc, s) => acc + (s.mastery.history?.length || 0), 0), icon: GraduationCap, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm shadow-slate-200/50"
          >
            <div className={`${stat.bg} ${stat.color} p-3 rounded-xl w-fit mb-4`}>
              <stat.icon size={24} />
            </div>
            <p className="text-slate-500 text-sm font-medium mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900 tracking-tight">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Student Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm shadow-slate-200/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            Learner Mastery Overview
            <span className="bg-indigo-100 text-indigo-700 text-xs py-0.5 px-2 rounded-full font-semibold">EDM Simulated</span>
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search students..."
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Current Mastery</th>
                <th className="px-6 py-4">Repeated Mistakes</th>
                <th className="px-6 py-4">Activity</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                        <UserIcon size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{student.name}</p>
                        <p className="text-slate-400 text-xs">{student.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getMasteryColor(student.mastery.masteryLevel)}`}>
                      {student.mastery.masteryLevel || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {student.mastery.repeatedMistakes?.length > 0 ? (
                        student.mastery.repeatedMistakes.map((m, i) => (
                          <span key={i} className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded font-medium border border-red-100">
                            {m}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-xs font-medium">No patterns detected</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden w-24">
                      <div 
                        className="bg-indigo-600 h-full rounded-full transition-all duration-1000"
                        style={{ width: `${student.mastery.history?.length * 10 || 0}%` }}
                      ></div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 font-bold">{student.mastery.history?.length || 0} interactions</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-slate-400 hover:text-indigo-600 transition-colors p-2 rounded-lg hover:bg-slate-100">
                      <Mail size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStudents.length === 0 && (
            <div className="py-12 text-center">
              <div className="bg-slate-50 p-4 rounded-full w-fit mx-auto mb-4">
                <Search className="text-slate-300" size={48} />
              </div>
              <p className="text-slate-500 font-medium tracking-tight">No students found matching your search</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
