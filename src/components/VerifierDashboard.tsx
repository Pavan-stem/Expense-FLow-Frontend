import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import {
  ClipboardCheck, Clock, CheckCircle2, Flag,
  RefreshCw, FileText, User, Calendar, DollarSign,
  TrendingUp, BarChart3, ArrowRight, ShieldCheck,
  CheckCircle, PieChart, Wallet, Building2, AlertTriangle
} from "lucide-react";
import {
  type EmployeeProfile, type Expense,
  getExpenses, subscribeToExpenses, getEmployees
} from "../lib/firebase";

interface VerifierDashboardProps {
  user: EmployeeProfile;
  refreshTrigger?: number;
  onNavigateToQueue?: (expenseId?: string) => void;
}

const MONTHS = [
  "All Months", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function fmt(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);
}

export default function VerifierDashboard({ user, refreshTrigger, onNavigateToQueue }: VerifierDashboardProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Month defaults to the current month per user requirement!
  const currentMonthName = new Date().toLocaleString("default", { month: "long" });
  const currentYearStr = new Date().getFullYear().toString();
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthName);
  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [allExp, allEmp] = await Promise.all([
        getExpenses(),
        getEmployees(),
      ]);
      setExpenses(allExp);
      setEmployees(allEmp.filter(e => e.role !== "admin" && e.role !== "verifier"));
    } catch (e) {
      console.error("Error loading verification analytics:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const unsub = subscribeToExpenses((updatedExpenses) => {
      setExpenses(updatedExpenses);
      setLoading(false);
    });
    return () => unsub();
  }, [refreshTrigger]);

  // Distinct available years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    years.add(currentYearStr);
    expenses.forEach(e => {
      if (e.date) {
        const y = new Date(e.date).getFullYear();
        if (!isNaN(y)) years.add(y.toString());
      }
    });
    return ["All Years", ...Array.from(years).sort().reverse()];
  }, [expenses, currentYearStr]);

  // Filtered expenses respective to month and year
  const monthlyExpenses = useMemo(() => {
    return expenses.filter(exp => {
      if (!exp.date) return false;
      const d = new Date(exp.date);
      if (isNaN(d.getTime())) return false;

      let matchMonth = true;
      let matchYear = true;

      if (selectedMonth !== "All Months") {
        const m = d.toLocaleString("default", { month: "long" });
        matchMonth = m.toLowerCase() === selectedMonth.toLowerCase();
      }

      if (selectedYear !== "All Years") {
        matchYear = d.getFullYear().toString() === selectedYear;
      }

      return matchMonth && matchYear;
    });
  }, [expenses, selectedMonth, selectedYear]);

  // Summary Metrics
  const stats = useMemo(() => {
    const total = monthlyExpenses.length;
    const awaitingVerif = monthlyExpenses.filter(e => !e.verificationStatus || e.verificationStatus === "pending").length;
    const verified = monthlyExpenses.filter(e => e.verificationStatus === "verified").length;
    const flagged = monthlyExpenses.filter(e => e.verificationStatus === "flagged").length;
    const totalAmount = monthlyExpenses.reduce((s, e) => s + (e.totalAmount || e.amount || 0), 0);
    const verifiedAmount = monthlyExpenses.filter(e => e.verificationStatus === "verified").reduce((s, e) => s + (e.totalAmount || e.amount || 0), 0);
    const percentVerified = total > 0 ? Math.round((verified / total) * 100) : 0;

    return { total, awaitingVerif, verified, flagged, totalAmount, verifiedAmount, percentVerified };
  }, [monthlyExpenses]);

  // Employee-wise breakdown for analytics
  const employeeBreakdown = useMemo(() => {
    const map = new Map<string, {
      employeeId: string;
      name: string;
      totalClaims: number;
      awaitingCount: number;
      verifiedCount: number;
      flaggedCount: number;
      totalAmount: number;
    }>();

    // Initialize from employees (excluding admin and verifiers)
    employees.forEach(emp => {
      if (emp.role === "admin" || emp.role === "verifier") return;
      const id = emp.employeeId || emp.id;
      if (id) {
        map.set(id, {
          employeeId: id,
          name: emp.name || id,
          totalClaims: 0,
          awaitingCount: 0,
          verifiedCount: 0,
          flaggedCount: 0,
          totalAmount: 0,
        });
      }
    });

    // Populate from monthly expenses
    monthlyExpenses.forEach(exp => {
      const id = exp.employeeId || "unknown";
      const name = exp.employeeName || "Employee";
      if (!map.has(id)) {
        map.set(id, {
          employeeId: id,
          name,
          totalClaims: 0,
          awaitingCount: 0,
          verifiedCount: 0,
          flaggedCount: 0,
          totalAmount: 0,
        });
      }
      const item = map.get(id)!;
      item.totalClaims += 1;
      item.totalAmount += (exp.totalAmount || exp.amount || 0);

      const verif = exp.verificationStatus || "pending";
      if (verif === "verified") item.verifiedCount += 1;
      else if (verif === "flagged") item.flaggedCount += 1;
      else item.awaitingCount += 1;
    });

    return Array.from(map.values())
      .filter(item => item.totalClaims > 0)
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [employees, monthlyExpenses]);

  // Category spending breakdown for analytics
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    monthlyExpenses.forEach(exp => {
      const cat = exp.category || "General";
      map.set(cat, (map.get(cat) || 0) + (exp.totalAmount || exp.amount || 0));
    });
    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthlyExpenses]);

  // Payment method breakdown
  const paymentBreakdown = useMemo(() => {
    let personal = 0;
    let sw = 0;
    let advance = 0;

    monthlyExpenses.forEach(exp => {
      const amt = exp.totalAmount || exp.amount || 0;
      const m = exp.paymentMethod || "";
      if (m.toLowerCase().includes("advance") || exp.paymentSource === "advance") advance += amt;
      else if (m.toLowerCase().includes("sw payment")) sw += amt;
      else personal += amt;
    });

    return { personal, sw, advance };
  }, [monthlyExpenses]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 bg-[#f8fafc] min-h-screen">
      {/* Greetings & Portal Navigation Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" /> Verifier Portal
            </span>
            <span className="text-xs text-slate-400 font-semibold">· Audit & Verification Dashboard</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Verification & Spending Analytics
          </h1>
          <p className="text-xs text-slate-500 font-medium max-w-2xl">
            Overview of employee expense vouchers for {selectedMonth === "All Months" ? "all recorded months" : `${selectedMonth} ${selectedYear}`}.
            Review audit statistics below or proceed to the Expense Queue to verify vouchers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onNavigateToQueue && (
            <button
              onClick={() => onNavigateToQueue()}
              className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
            >
              <ClipboardCheck className="h-4 w-4" />
              {stats.awaitingVerif > 0 ? `Review ${stats.awaitingVerif} Pending Vouchers` : "Go to Expense Queue"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            onClick={fetchData}
            className="p-3 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 transition shadow-2xs cursor-pointer"
            title="Refresh Analytics"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Month & Period Selector Bar (Defaulting to current month) */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Calendar className="h-4 w-4 text-emerald-600" />
          <span>Showing Analytics for:</span>
          <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            {selectedMonth} {selectedYear !== "All Years" ? selectedYear : ""}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
            <span className="text-slate-500 font-semibold">Month:</span>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              {MONTHS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Year Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
            <span className="text-slate-500 font-semibold">Year:</span>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {selectedMonth !== currentMonthName && (
            <button
              onClick={() => {
                setSelectedMonth(currentMonthName);
                setSelectedYear(currentYearStr);
              }}
              className="text-xs text-emerald-600 hover:text-emerald-800 font-bold px-2 py-1 rounded-lg hover:bg-emerald-50 transition cursor-pointer"
            >
              Reset to Current Month
            </button>
          )}
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {[
          { label: "Total Claims", value: stats.total, icon: FileText, color: "text-slate-800", iconColor: "text-slate-600", iconBg: "bg-slate-100" },
          { label: "Awaiting Review", value: stats.awaitingVerif, icon: Clock, color: "text-amber-600", iconColor: "text-amber-600", iconBg: "bg-amber-50" },
          { label: "Verified Claims", value: stats.verified, icon: CheckCircle2, color: "text-emerald-600", iconColor: "text-emerald-600", iconBg: "bg-emerald-50" },
          { label: "Unverified Claims", value: stats.flagged, icon: Flag, color: "text-rose-600", iconColor: "text-rose-600", iconBg: "bg-rose-50" },
          { label: "Total Amount", value: fmt(stats.totalAmount), icon: TrendingUp, color: "text-teal-700", iconColor: "text-teal-600", iconBg: "bg-teal-50", wide: true },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`bg-white rounded-2xl p-4 border border-slate-100 shadow-xs hover:shadow-md hover:border-slate-200 transition ${(stat as any).wide ? "col-span-2 lg:col-span-1" : ""
              }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{stat.label}</span>
              <div className={`w-8 h-8 rounded-xl ${stat.iconBg} flex items-center justify-center ${stat.iconColor}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <p className={`text-2xl font-black ${stat.color} font-mono tracking-tight`}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Verification Health & Audit Completion Meter */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              Monthly Audit Completion Progress
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {stats.verified} of {stats.total} expense claims verified for {selectedMonth}
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-emerald-600 font-mono">{stats.percentVerified}%</span>
            <span className="text-xs text-slate-400 font-bold block">Verified</span>
          </div>
        </div>

        {/* Multi-segmented Progress Bar */}
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
          <div
            style={{ width: `${stats.total > 0 ? (stats.verified / stats.total) * 100 : 0}%` }}
            className="bg-emerald-500 transition-all duration-500"
            title={`Verified: ${stats.verified}`}
          />
          <div
            style={{ width: `${stats.total > 0 ? (stats.flagged / stats.total) * 100 : 0}%` }}
            className="bg-rose-500 transition-all duration-500"
            title={`Flagged: ${stats.flagged}`}
          />
          <div
            style={{ width: `${stats.total > 0 ? (stats.awaitingVerif / stats.total) * 100 : 0}%` }}
            className="bg-amber-400 transition-all duration-500"
            title={`Awaiting: ${stats.awaitingVerif}`}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-5 text-xs pt-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600 font-semibold">Verified ({stats.verified})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-slate-600 font-semibold">Awaiting Verification ({stats.awaitingVerif})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span className="text-slate-600 font-semibold">Flagged for Correction ({stats.flagged})</span>
          </div>
          <div className="ml-auto text-xs font-bold text-slate-700">
            Verified Value: <span className="font-mono text-emerald-700">{fmt(stats.verifiedAmount)}</span>
          </div>
        </div>
      </div>

      {/* Analytics Grid: Employee Spending Table & Category/Payment Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee-wise Verification Breakdown Table (2 Columns) */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Employee Claims Audit Breakdown ({employeeBreakdown.length})
              </h3>
            </div>
            {onNavigateToQueue && (
              <button
                onClick={() => onNavigateToQueue()}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
              >
                View in Queue <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          {employeeBreakdown.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No employee expense claims found for {selectedMonth} {selectedYear}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3 text-center">Total Claims</th>
                    <th className="py-2.5 px-3 text-center">Verified</th>
                    <th className="py-2.5 px-3 text-center">Awaiting</th>
                    <th className="py-2.5 px-3 text-right">Claimed (₹)</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employeeBreakdown.map(emp => (
                    <tr key={emp.employeeId} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-3 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span>{emp.name}</span>
                            <span className="block text-[10px] text-slate-400 font-mono">{emp.employeeId}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-700">{emp.totalClaims}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {emp.verifiedCount}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {emp.awaitingCount > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            {emp.awaitingCount}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-slate-900 font-mono">
                        {fmt(emp.totalAmount)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {onNavigateToQueue && (
                          <button
                            onClick={() => onNavigateToQueue(emp.employeeId)}
                            className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 transition cursor-pointer"
                          >
                            Inspect
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Operational & Category Distribution (1 Column) */}
        <div className="space-y-6">
          {/* Payment Mode Distribution */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Payment Mode Breakdown</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700 tracking-wider">Personal Payment</span>
                  <p className="text-[11px] text-slate-500">Employee Reimbursable</p>
                </div>
                <span className="text-sm font-black text-indigo-900 font-mono">{fmt(paymentBreakdown.personal)}</span>
              </div>

              <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-purple-700 tracking-wider">Company SW Payment</span>
                  <p className="text-[11px] text-slate-500">Corporate Card / Vendor Pay</p>
                </div>
                <span className="text-sm font-black text-purple-900 font-mono">{fmt(paymentBreakdown.sw)}</span>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-700 tracking-wider">Advance Settlement</span>
                  <p className="text-[11px] text-slate-500">Settled from Advance Wallet</p>
                </div>
                <span className="text-sm font-black text-emerald-900 font-mono">{fmt(paymentBreakdown.advance)}</span>
              </div>
            </div>
          </div>

          {/* Top Categories Distribution */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Top Spending Categories</h3>
            </div>

            {categoryBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400">No category claims for {selectedMonth}.</p>
            ) : (
              <div className="space-y-2.5">
                {categoryBreakdown.slice(0, 5).map(cat => {
                  const pct = stats.totalAmount > 0 ? Math.round((cat.amount / stats.totalAmount) * 100) : 0;
                  return (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span className="truncate">{cat.name}</span>
                        <span className="font-mono text-slate-900">{fmt(cat.amount)} ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div style={{ width: `${pct}%` }} className="h-full bg-emerald-500 rounded-full" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
