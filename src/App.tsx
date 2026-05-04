import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, User, LogOut, LayoutDashboard, BrainCircuit, GraduationCap, Settings, Shield } from 'lucide-react';

// --- Auth Context ---
interface UserData {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  login: (userData: UserData) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setUser(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const login = (userData: UserData) => setUser(userData);
  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => setUser(null));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// --- Components ---
const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <BrainCircuit size={24} />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 font-sans tracking-tight">
              PythonITS
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <div className="flex flex-col items-end mr-2">
                  <span className="text-sm font-medium text-slate-900">{user.name}</span>
                  <span className="text-xs text-slate-500 capitalize">{user.role}</span>
                </div>
                <button 
                  onClick={logout}
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                >
                  <LogOut size={20} />
                </button>
              </>
            ) : (
              <button 
                onClick={() => navigate('/login')}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

// --- Pages ---
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import AdminDashboard from './pages/AdminDashboard';

const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
          <Navbar />
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              
              <Route path="/" element={<ProtectedRoute />}>
                <Route index element={<DashboardRedirect />} />
                <Route path="student/*" element={<StudentDashboard />} />
                <Route path="teacher/*" element={<TeacherDashboard />} />
                <Route path="admin/*" element={<AdminDashboard />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AnimatePresence>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex h-[calc(100vh-64px)] items-center justify-center">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"
      />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"><motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}><Routes><Route index element={<DashboardRedirect />} /><Route path="student/*" element={<StudentDashboard />} /><Route path="teacher/*" element={<TeacherDashboard />} /><Route path="admin/*" element={<AdminDashboard />} /></Routes></motion.div></div>;
};

// Corrected ProtectedRoute to use <Outlet /> pattern or just simpler wrapping
const DashboardRedirect = () => {
  const { user } = useAuth();
  if (user?.role === 'student') return <Navigate to="/student" replace />;
  if (user?.role === 'teacher') return <Navigate to="/teacher" replace />;
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/login" replace />;
};

export default App;
