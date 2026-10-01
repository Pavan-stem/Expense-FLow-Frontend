import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { loginWithEmailAndPassword, registerUser, type EmployeeProfile } from "../lib/firebase";
import { LogIn, UserPlus, Key, Mail, Shield, User, Landmark, Phone, Eye, EyeOff, CheckCircle, AlertCircle, ClipboardCheck } from "lucide-react";

type PortalType = "employee" | "verifier" | "admin";

interface LoginProps {
  onLoginSuccess: (user: EmployeeProfile) => void;
}

function getPortalFromPath(): PortalType {
  if (typeof window === "undefined") return "employee";
  const p = window.location.pathname;
  if (p.startsWith("/admin")) return "admin";
  if (p.startsWith("/verifier")) return "verifier";
  return "employee";
}

const PORTAL_CONFIG: Record<PortalType, {
  label: string;
  portalTag: string;
  path: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  buttonClass: string;
  accentText: string;
  accentHover: string;
  focusRing: string;
  focusBorder: string;
  description: string;
  registerLabel: string;
  placeholder: string;
}> = {
  employee: {
    label: "Employee Portal",
    portalTag: "EMPLOYEE PORTAL",
    path: "/",
    icon: Landmark,
    iconBg: "bg-indigo-50 border border-indigo-100",
    iconColor: "text-indigo-600",
    badgeBg: "bg-indigo-50",
    badgeBorder: "border-indigo-200",
    badgeText: "text-indigo-700",
    buttonClass: "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20",
    accentText: "text-indigo-600",
    accentHover: "hover:text-indigo-700",
    focusRing: "focus:ring-indigo-500/20",
    focusBorder: "focus:border-indigo-500",
    description: "Sign in to access your Employee Dashboard",
    registerLabel: "Employee",
    placeholder: "employee@company.com",
  },
  verifier: {
    label: "Verifier Portal",
    portalTag: "VERIFIER PORTAL",
    path: "/verifier",
    icon: ClipboardCheck,
    iconBg: "bg-emerald-50 border border-emerald-100",
    iconColor: "text-emerald-600",
    badgeBg: "bg-emerald-50",
    badgeBorder: "border-emerald-200",
    badgeText: "text-emerald-700",
    buttonClass: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20",
    accentText: "text-emerald-600",
    accentHover: "hover:text-emerald-700",
    focusRing: "focus:ring-emerald-500/20",
    focusBorder: "focus:border-emerald-500",
    description: "Sign in to access your Verifier Dashboard",
    registerLabel: "Verifier",
    placeholder: "verifier@company.com",
  },
  admin: {
    label: "Admin Portal",
    portalTag: "ADMIN PORTAL",
    path: "/admin",
    icon: Shield,
    iconBg: "bg-purple-50 border border-purple-100",
    iconColor: "text-purple-600",
    badgeBg: "bg-purple-50",
    badgeBorder: "border-purple-200",
    badgeText: "text-purple-700",
    buttonClass: "bg-[#8b2cf5] hover:bg-[#7a22dc] shadow-purple-500/20",
    accentText: "text-purple-600",
    accentHover: "hover:text-purple-700",
    focusRing: "focus:ring-purple-500/20",
    focusBorder: "focus:border-purple-500",
    description: "Sign in to access your Admin Dashboard",
    registerLabel: "Admin",
    placeholder: "admin@company.com",
  },
};

export default function Login({ onLoginSuccess }: LoginProps) {
  const [portal, setPortal] = useState<PortalType>(getPortalFromPath);
  const [isRegistering, setIsRegistering] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setPortal(getPortalFromPath());
      setError("");
      setEmail("");
      setPassword("");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);


  const cfg = PORTAL_CONFIG[portal];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setError(""); setLoading(true);
    try {
      const user = await loginWithEmailAndPassword(email, password);
      if (user) {
        if (portal === "admin" && user.role !== "admin") {
          setError("Access Denied: Only Administrator accounts can log in via the Admin Portal.");
          setLoading(false); return;
        }
        if (portal === "verifier" && user.role !== "verifier") {
          setError("Access Denied: Only Verifier accounts can log in via the Verifier Portal.");
          setLoading(false); return;
        }
        if (portal === "employee" && user.role !== "employee") {
          setError(`Access Denied: This portal is for employees only. Use the ${user.role === "admin" ? "Admin" : "Verifier"} Portal instead.`);
          setLoading(false); return;
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
      setError("Please fill in all required fields (Name, Email, Password)."); return;
    }
    const hasAlphabet = /[a-zA-Z]/.test(regPassword);
    const hasSpecialChar = /[^a-zA-Z0-9]/.test(regPassword);
    if (regPassword.length < 6 || !hasAlphabet || !hasSpecialChar) {
      setError("Password must be at least 6 characters and contain letters + a special character."); return;
    }
    setError(""); setLoading(true);
    try {
      const prefix = portal === "admin" ? "ADM" : portal === "verifier" ? "VER" : "EMP";
      const generatedId = prefix + Math.floor(100 + Math.random() * 900);
      const defaultDept = portal === "admin" ? "Management" : portal === "verifier" ? "Finance" : "Engineering";
      const defaultDesig = portal === "admin" ? "Administrator" : portal === "verifier" ? "Expense Verifier" : "Staff Associate";
      const defaultManager = portal === "admin" ? "Executive Board" : portal === "verifier" ? "Finance Head" : "HR Operations";
      const newUser = await registerUser(
        {
          id: generatedId, employeeId: generatedId, name: regName, email: regEmail,
          department: defaultDept, designation: defaultDesig, phone: regPhone || "N/A",
          manager: defaultManager, joiningDate: new Date().toISOString().split("T")[0]
        },
        regPassword, portal
      );
      if (newUser) { onLoginSuccess(newUser); }
      else { setError("Registration failed."); }
    } catch (err: any) {
      setError(err.message || "Email or User ID already exists.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `block w-full pl-10 pr-3.5 py-3 border border-slate-200 rounded-xl text-slate-900 bg-slate-50/80 placeholder-slate-400 text-sm outline-none transition focus:bg-white focus:ring-2 ${cfg.focusRing} ${cfg.focusBorder}`;
  const inputClassPr = `block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl text-slate-900 bg-slate-50/80 placeholder-slate-400 text-sm outline-none transition focus:bg-white focus:ring-2 ${cfg.focusRing} ${cfg.focusBorder}`;

  return (
    <div
      id="login-container"
      className="min-h-screen flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#f8fafc] relative overflow-hidden"
    >
      <div className="relative z-10 w-full max-w-md">
        {/* Login / Register Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${portal}-${isRegistering ? "reg" : "login"}`}
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.2 }}
            className="w-full bg-white rounded-3xl border border-slate-100 shadow-[0_10px_35px_-5px_rgba(0,0,0,0.06)] p-6 sm:p-10 space-y-6"
          >
            {/* Header with Icon, Title and Portal Pill */}
            <div className="text-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm ${cfg.iconBg}`}>
                <cfg.icon className={`h-7 w-7 ${cfg.iconColor}`} />
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">ExpenseFlow</h1>
              <div className="flex justify-center mt-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold tracking-wider uppercase ${cfg.badgeBg} ${cfg.badgeBorder} ${cfg.badgeText}`}>
                  <cfg.icon className="h-3.5 w-3.5" />
                  {cfg.portalTag}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-2.5">
                {isRegistering ? `Create your ${cfg.registerLabel} account` : cfg.description}
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                id="login-error-alert"
                className="flex items-start gap-2.5 p-3 bg-rose-50 text-rose-700 text-xs font-medium rounded-xl border border-rose-200"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-500" />
                <span>{error}</span>
              </motion.div>
            )}

            {!isRegistering ? (
              <form className="space-y-4" onSubmit={handleLogin}>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                      placeholder={cfg.placeholder}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Key className="h-4 w-4" />
                    </div>
                    <input
                      id="login-password"
                      name="password"
                      type={showLoginPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClassPr}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
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
                  className={`w-full py-3 px-4 text-sm font-bold rounded-xl text-white transition duration-150 shadow-md disabled:opacity-50 ${cfg.buttonClass} cursor-pointer`}
                >
                  {loading ? "Authenticating..." : `Sign In as ${cfg.registerLabel}`}
                </button>

                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-4">
                  <span>Need an account?</span>
                  <button
                    id="toggle-register-btn"
                    type="button"
                    onClick={() => { setIsRegistering(true); setError(""); }}
                    className={`font-semibold flex items-center gap-1 transition ${cfg.accentText} ${cfg.accentHover} cursor-pointer`}
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Register as {cfg.registerLabel}
                  </button>
                </div>
              </form>
            ) : (
              <form className="space-y-3.5" onSubmit={handleRegister}>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                    Full Name *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      id="reg-fullname"
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className={inputClass}
                      placeholder={portal === "admin" ? "Admin Name" : portal === "verifier" ? "Verifier Name" : "Full Name"}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                    Email Address *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      id="reg-email"
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className={inputClass}
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                    Password *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Key className="h-4 w-4" />
                    </div>
                    <input
                      id="reg-password"
                      type={showRegPassword ? "text" : "password"}
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className={inputClassPr}
                      placeholder="Min 6 chars + special character"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    >
                      {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Must contain letters and a special character (e.g. !@#$%).</p>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                    Phone Number
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Phone className="h-4 w-4" />
                    </div>
                    <input
                      id="reg-phone"
                      type="text"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className={inputClass}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>

                <button
                  id="reg-submit-btn"
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 px-4 text-sm font-bold rounded-xl text-white transition duration-150 shadow-md disabled:opacity-50 ${cfg.buttonClass} cursor-pointer flex items-center justify-center gap-2`}
                >
                  <CheckCircle className="h-4 w-4" />
                  {loading ? "Creating Account..." : `Register as ${cfg.registerLabel}`}
                </button>

                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-4">
                  <span>Already have an account?</span>
                  <button
                    id="toggle-login-btn"
                    type="button"
                    onClick={() => { setIsRegistering(false); setError(""); }}
                    className={`font-semibold transition ${cfg.accentText} ${cfg.accentHover} cursor-pointer`}
                  >
                    Sign In Instead
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
