import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { loginWithEmailAndPassword, registerUser, type EmployeeProfile } from "../lib/firebase";
import { LogIn, UserPlus, Key, Mail, Shield, User, Landmark, Phone, Eye, EyeOff } from "lucide-react";


interface LoginProps {
  onLoginSuccess: (user: EmployeeProfile) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  // Check if current URL path is /admin
  const [isAdminPath, setIsAdminPath] = useState(() => {
    return typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  });

  const [isRegistering, setIsRegistering] = useState(false);

  // Form input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Register form states
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Listen to browser forward/back navigation
  useEffect(() => {
    const handlePopState = () => {
      const isNavAdmin = window.location.pathname.startsWith("/admin");
      setIsAdminPath(isNavAdmin);
      setError("");
      setEmail("");
      setPassword("");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateToPath = (toAdmin: boolean) => {
    setIsAdminPath(toAdmin);
    setError("");
    setIsRegistering(false);
    setEmail("");
    setPassword("");

    const targetUrl = toAdmin ? "/admin" : "/";
    if (typeof window !== "undefined" && window.location.pathname !== targetUrl) {
      window.history.pushState({}, "", targetUrl);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const user = await loginWithEmailAndPassword(email, password);
      if (user) {
        if (isAdminPath && user.role !== "admin") {
          setError("Access Denied: Only Administrator accounts can log in via the Admin Portal (/admin).");
          setLoading(false);
          return;
        }
        if (!isAdminPath && user.role === "admin") {
          // If admin logs in on employee route, switch URL to /admin automatically
          if (typeof window !== "undefined") {
            window.history.pushState({}, "", "/admin");
          }
        }
        onLoginSuccess(user);
      } else {
        setError("Invalid email or password. Please check your credentials.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword) {
      setError("Please fill in all required fields (Name, Email, Password).");
      return;
    }

    const hasAlphabet = /[a-zA-Z]/.test(regPassword);
    const hasSpecialChar = /[^a-zA-Z0-9]/.test(regPassword);

    if (regPassword.length < 6 || !hasAlphabet || !hasSpecialChar) {
      setError("Password must be at least 6 characters long and contain letters and a special character (e.g. !@#$%).");
      return;
    }


    setError("");
    setLoading(true);
    try {
      const targetRole = isAdminPath ? "admin" : "employee";
      const prefix = targetRole === "admin" ? "ADM" : "EMP";
      const generatedId = prefix + Math.floor(100 + Math.random() * 900);
      const defaultDept = targetRole === "admin" ? "Management" : "Engineering";
      const defaultDesig = targetRole === "admin" ? "Administrator" : "Staff Associate";
      const defaultManager = targetRole === "admin" ? "Executive Board" : "HR Operations";
      const defaultJoinDate = new Date().toISOString().split("T")[0];

      const newUser = await registerUser(
        {
          id: generatedId,
          employeeId: generatedId,
          name: regName,
          email: regEmail,
          department: defaultDept,
          designation: defaultDesig,
          phone: regPhone || "N/A",
          manager: defaultManager,
          joiningDate: defaultJoinDate,
        },
        regPassword,
        targetRole
      );

      if (newUser) {
        onLoginSuccess(newUser);
      } else {
        setError("Registration failed.");
      }
    } catch (err: any) {
      setError(err.message || "Email or User ID already exists.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-container" className="min-h-screen flex flex-col items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <motion.div
        key={isAdminPath ? "admin-card" : "employee-card"}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-md w-full space-y-6 bg-white p-8 rounded-2xl shadow-xl border border-slate-100"
      >
        <div>
          <div className="flex justify-center">
            <span className={`p-3 rounded-xl transition-colors ${isAdminPath ? "bg-purple-100 text-purple-700" : "bg-indigo-100 text-indigo-700"}`}>
              {isAdminPath ? <Shield className="h-10 w-10" /> : <Landmark className="h-10 w-10" />}
            </span>
          </div>

          <h2 className="mt-4 text-center text-3xl font-bold tracking-tight text-slate-900 font-sans">
            ExpenseFlow
          </h2>

          {/* Interactive Portal Switcher Tabs */}
          <div className="mt-4 flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              id="switch-to-employee-portal-btn"
              type="button"
              onClick={() => navigateToPath(false)}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                !isAdminPath
                  ? "bg-white text-indigo-700 shadow-xs border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <User className="h-3.5 w-3.5" />
              Employee Portal (/)
            </button>
            <button
              id="switch-to-admin-portal-btn"
              type="button"
              onClick={() => navigateToPath(true)}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                isAdminPath
                  ? "bg-white text-purple-700 shadow-xs border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              Admin Portal (/admin)
            </button>
          </div>

          <p className="mt-2 text-center text-sm text-slate-500 font-medium">
            {isRegistering
              ? `Register a New ${isAdminPath ? "Administrator" : "Employee"} Account`
              : `Sign in to access your ${isAdminPath ? "Admin Dashboard" : "Employee Expense Portal"}`}
          </p>
        </div>

        {error && (
          <div id="login-error-alert" className="p-3.5 bg-rose-50 text-rose-700 text-xs font-medium rounded-xl border border-rose-100">
            {error}
          </div>
        )}

        {!isRegistering ? (
          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm outline-none transition"
                  placeholder={isAdminPath ? "admin@company.com" : "employee@company.com"}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Key className="h-4 w-4" />
                </div>
                <input
                  id="login-password"
                  name="password"
                  type={showLoginPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-9 pr-10 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm outline-none transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-indigo-600 transition"
                  title={showLoginPassword ? "Hide password" : "Show password"}
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-xl text-white transition duration-150 shadow-md disabled:opacity-50 ${isAdminPath ? "bg-purple-600 hover:bg-purple-700 focus:ring-purple-500" : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                }`}
            >
              {loading ? "Authenticating..." : `Sign In as ${isAdminPath ? "Admin" : "Employee"}`}
            </button>

            <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-4">
              <span>Need an account?</span>
              <button
                id="toggle-register-btn"
                type="button"
                onClick={() => {
                  setIsRegistering(true);
                  setError("");
                }}
                className={`font-semibold flex items-center gap-1 transition ${isAdminPath ? "text-purple-600 hover:text-purple-700" : "text-indigo-600 hover:text-indigo-700"
                  }`}
              >
                <UserPlus className="h-3.5 w-3.5" /> Register as {isAdminPath ? "Admin" : "Employee"}
              </button>
            </div>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleRegister}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Full Name*</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  id="reg-fullname"
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-sm outline-none transition"
                  placeholder={isAdminPath ? "Admin" : "User Name"}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Email Address*</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-sm outline-none transition"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Password*</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Key className="h-4 w-4" />
                </div>
                <input
                  id="reg-password"
                  type={showRegPassword ? "text" : "password"}
                  required
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="block w-full pl-9 pr-10 py-2 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-sm outline-none transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-indigo-600 transition"
                  title={showRegPassword ? "Hide password" : "Show password"}
                >
                  {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Must contain letters and a special character (e.g. !@#$%).</p>

            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Phone Number</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Phone className="h-4 w-4" />
                </div>
                <input
                  id="reg-phone"
                  type="text"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-sm outline-none transition"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </div>

            <button
              id="reg-submit-btn"
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-xl text-white transition duration-150 shadow-md disabled:opacity-50 ${isAdminPath ? "bg-purple-600 hover:bg-purple-700 focus:ring-purple-500" : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                }`}
            >
              {loading ? "Creating Account..." : `Register as ${isAdminPath ? "Admin" : "Employee"}`}
            </button>

            <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-3">
              <span>Already registered?</span>
              <button
                id="toggle-login-btn"
                type="button"
                onClick={() => {
                  setIsRegistering(false);
                  setError("");
                }}
                className={`font-semibold transition ${isAdminPath ? "text-purple-600 hover:text-purple-700" : "text-indigo-600 hover:text-indigo-700"
                  }`}
              >
                Sign In Instead
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

