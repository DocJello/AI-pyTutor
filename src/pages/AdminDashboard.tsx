import React, { useState, useEffect } from 'react';
import { Shield, User, Trash2, Mail, MoreVertical } from 'lucide-react';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

const AdminDashboard = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        setUsers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Administration</h1>
          <p className="text-slate-500 text-sm">Manage academic accounts and permissions</p>
        </div>
        <div className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold shadow-md shadow-indigo-100 cursor-pointer hover:bg-indigo-700 transition-colors">
          <Shield size={18} />
          Security Audit
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm shadow-slate-200/50 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
            <tr>
              <th className="px-6 py-4">Full Name</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Created Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                      {u.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{u.name}</p>
                      <p className="text-slate-400 text-xs">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded border ${
                    u.role === 'admin' ? 'bg-purple-50 text-purple-600 border-purple-100' : 
                    u.role === 'teacher' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                    'bg-slate-50 text-slate-600 border-slate-100'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-500 text-xs font-medium">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors">
                      <Mail size={16} />
                    </button>
                    <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDashboard;
