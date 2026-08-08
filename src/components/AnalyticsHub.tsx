import { useState, useEffect } from "react";
import { 
  getExpenses, 
  getExpensesByEmployee, 
  getEmployees,
  type EmployeeProfile, 
  type Expense 
} from "../lib/firebase";
import { 
  BarChart, 
  Bar, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar, 
  Legend 
} from "recharts";
import { BarChart2, TrendingUp, Award, IndianRupee, Wallet, RefreshCw, Calendar } from "lucide-react";

interface AnalyticsHubProps {
  user: EmployeeProfile;
  refreshTrigger: number;
}

export default function AnalyticsHub({ user, refreshTrigger }: AnalyticsHubProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExpensesAndEmployees = async () => {
      setLoading(true);
      try {
        let data: Expense[] = [];
        if (user.role === "admin") {
          data = await getExpenses();
        } else {
          data = await getExpensesByEmployee(user.employeeId);
        }
        setExpenses(data);

        const emps = await getEmployees();
        setEmployees(emps);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchExpensesAndEmployees();
  }, [user.employeeId, refreshTrigger]);

  // Time Period Filter
  const now = new Date();
  const currentMonthIdx = now.getMonth();
  const currentYearNum = now.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthIdx);
  const [selectedYear, setSelectedYear] = useState<number>(currentYearNum);
  const [isAllTime, setIsAllTime] = useState<boolean>(false);

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  const selectedMonthName = MONTH_NAMES[selectedMonth];
  const isCurrentMonthSelected = selectedMonth === currentMonthIdx && selectedYear === currentYearNum;

  const isDateInMonth = (dateStr: string, monthIdx: number, yearNum: number) => {
    if (!dateStr) return false;
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      return y === yearNum && m === monthIdx;
    }
    const d = new Date(dateStr);
    return d.getFullYear() === yearNum && d.getMonth() === monthIdx;
  };

  const activeExpenses = isAllTime
    ? expenses
    : expenses.filter(e => isDateInMonth(e.date, selectedMonth, selectedYear));

  // Calculations
  const averageClaim = activeExpenses.length > 0 
    ? parseFloat((activeExpenses.reduce((sum, e) => sum + e.totalAmount, 0) / activeExpenses.length).toFixed(2))
    : 0;

  const maxClaim = activeExpenses.length > 0
    ? Math.max(...activeExpenses.map(e => e.totalAmount))
    : 0;

  // Chart: Type of Expense Spending (Category)
  const expenseTypeSpendingData = () => {
    const totals: { [key: string]: number } = {};
    activeExpenses.forEach(e => {
      const type = e.category || "Miscellaneous";
      totals[type] = (totals[type] || 0) + e.totalAmount;
    });

    return Object.keys(totals).map(k => ({
      expenseType: k,
      TotalSpent: parseFloat(totals[k].toFixed(2))
    })).sort((a, b) => b.TotalSpent - a.TotalSpent);
  };

  // Chart 2: Payment Methods Usage
  const paymentMethodData = () => {
    const methods: { [key: string]: number } = { UPI: 0, "Credit Card": 0, "Debit Card": 0, Cash: 0, "Bank Transfer": 0 };
    activeExpenses.forEach(e => {
      if (methods[e.paymentMethod] !== undefined) {
        methods[e.paymentMethod] += e.totalAmount;
      }
    });

    return Object.keys(methods).map(k => ({
      name: k,
      value: parseFloat(methods[k].toFixed(2))
    })).filter(v => v.value > 0);
  };

  const COLORS = ["#6366f1", "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b"];

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 text-sm">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600 mx-auto mb-2" />
        Processing analytics metrics...
      </div>
    );
  }

  return (
    <div id="analytics-hub-container" className="py-6 px-4 max-w-7xl mx-auto space-y-6">
      {/* Title */}
      <div className="border-b border-slate-100 pb-5">
        <h2 className="text-xl font-bold text-slate-900 font-sans">Advanced Spending Analytics</h2>
      </div>

      {/* Time Period Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-100 shadow-2xs">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-600" />
          <span className="text-xs font-bold text-slate-800">
            {isAllTime ? "All-Time Spending Analytics" : `Spending Analytics for ${selectedMonthName} ${selectedYear}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          {/* Month & Year Selectors */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/70">
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(parseInt(e.target.value, 10));
                setIsAllTime(false);
              }}
              className="bg-white text-indigo-700 font-extrabold px-2.5 py-1 rounded-lg border border-slate-200/60 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx}>{m}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(parseInt(e.target.value, 10));
                setIsAllTime(false);
              }}
              className="bg-white text-indigo-700 font-extrabold px-2.5 py-1 rounded-lg border border-slate-200/60 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Quick "Current Month" button */}
          {(!isCurrentMonthSelected || isAllTime) && (
            <button
              type="button"
              onClick={() => {
                setSelectedMonth(currentMonthIdx);
                setSelectedYear(currentYearNum);
                setIsAllTime(false);
              }}
              className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition cursor-pointer text-xs font-bold"
            >
              Current Month
            </button>
          )}

          {/* All Time toggle */}
          <button
            type="button"
            onClick={() => setIsAllTime(!isAllTime)}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer border ${
              isAllTime
                ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs font-extrabold"
                : "bg-slate-100 text-slate-500 border-slate-200 hover:text-slate-800 font-bold"
            }`}
          >
            🌐 All Time
          </button>
        </div>
      </div>

      {/* Numerical Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <span className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <IndianRupee className="h-5 w-5" />
          </span>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">
              {isAllTime ? "Average Claim Size (All Time)" : `Average Claim (${selectedMonthName})`}
            </span>
            <span className="block text-xl font-black text-slate-800 font-mono">₹{averageClaim.toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <span className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Award className="h-5 w-5" />
          </span>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">
              {isAllTime ? "Highest Claim (All Time)" : `Highest Claim (${selectedMonthName})`}
            </span>
            <span className="block text-xl font-black text-slate-800 font-mono">₹{maxClaim.toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <span className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">
              {isAllTime ? "Total Audit Volume (All Time)" : `Audit Volume (${selectedMonthName})`}
            </span>
            <span className="block text-xl font-black text-slate-800 font-mono">{activeExpenses.length} claims</span>
          </div>
        </div>
      </div>

      {/* Main comparative graphs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Expense Type Spending */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-50 pb-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {isAllTime ? "Spending by Category (All Time)" : `Spending by Category (${selectedMonthName} ${selectedYear})`}
            </h3>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseTypeSpendingData()} layout="vertical" margin={{ left: 5, right: 10, top: 5, bottom: 5 }}>
                <XAxis type="number" fontSize={9} stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis dataKey="expenseType" type="category" fontSize={8} stroke="#94a3b8" tickLine={false} axisLine={false} width={110} />
                <Tooltip formatter={(value) => `₹${value}`} contentStyle={{ fontSize: "10px" }} />
                <Bar dataKey="TotalSpent" radius={[0, 4, 4, 0]}>
                  {expenseTypeSpendingData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Method Distribution */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Payment Method Share (₹)</h3>
          {paymentMethodData().length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400 italic">No transaction records logged yet.</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentMethodData()}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {paymentMethodData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `₹${value}`} contentStyle={{ fontSize: "10px" }} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
