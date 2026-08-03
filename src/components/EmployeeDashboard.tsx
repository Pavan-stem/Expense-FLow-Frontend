import { useState, useEffect } from "react";
import { 
  getExpensesByEmployee, 
  type EmployeeProfile, 
  type Expense 
} from "../lib/firebase";
import { 
  IndianRupee, 
  Clock, 
  CheckCircle2, 
  TrendingUp, 
  Receipt, 
  AlertCircle 
} from "lucide-react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  Legend 
} from "recharts";

interface EmployeeDashboardProps {
  user: EmployeeProfile;
  onNavigateToSubmit: () => void;
  onNavigateToExpenses: () => void;
  refreshTrigger: number;
}

export default function EmployeeDashboard({ user, onNavigateToSubmit, onNavigateToExpenses, refreshTrigger }: EmployeeDashboardProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExpenses = async () => {
      setLoading(true);
      try {
        const data = await getExpensesByEmployee(user.employeeId);
        setExpenses(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchExpenses();
  }, [user.employeeId, refreshTrigger]);

  // Calculations
  const currentMonthName = new Date().toLocaleString("default", { month: "long" });
  const currentYear = new Date().getFullYear();

  const currentMonthExpenses = expenses.filter(exp => {
    const d = new Date(exp.date);
    return d.toLocaleString("default", { month: "long" }) === currentMonthName && d.getFullYear() === currentYear;
  });

  const totalThisMonth = currentMonthExpenses.reduce((sum, exp) => sum + exp.totalAmount, 0);
  
  const approvedAmount = expenses
    .filter(e => e.status === "approved" || e.status === "reimbursed")
    .reduce((sum, e) => sum + e.totalAmount, 0);

  const pendingAmount = expenses
    .filter(e => e.status === "pending" || e.status === "under_review")
    .reduce((sum, e) => sum + e.totalAmount, 0);

  const reimbursedAmount = expenses
    .filter(e => e.status === "reimbursed")
    .reduce((sum, e) => sum + e.totalAmount, 0);

  // Chart 1: Monthly Expense Trend
  const monthlyTrendData = () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const currentYr = now.getFullYear();

    const dataMap = months.map((m, idx) => {
      const monthExpenses = expenses.filter(exp => {
        const d = new Date(exp.date);
        return d.getMonth() === idx && d.getFullYear() === currentYr;
      });
      const total = monthExpenses.reduce((sum, exp) => sum + exp.totalAmount, 0);
      return { name: m, Amount: parseFloat(total.toFixed(2)) };
    });

    return dataMap;
  };

  // Chart 2: Category distribution
  const categoryData = () => {
    const catMap: { [key: string]: number } = {};
    expenses.forEach(e => {
      catMap[e.category] = (catMap[e.category] || 0) + e.totalAmount;
    });

    return Object.keys(catMap).map(k => ({
      name: k,
      value: parseFloat(catMap[k].toFixed(2))
    })).sort((a, b) => b.value - a.value).slice(0, 5);
  };

  // Chart 3: Expense Status Distribution
  const statusData = () => {
    const statusCounts = { pending: 0, under_review: 0, approved: 0, rejected: 0, reimbursed: 0 };
    expenses.forEach(e => {
      if (statusCounts[e.status] !== undefined) {
        statusCounts[e.status] += e.totalAmount;
      }
    });

    return [
      { name: "Pending", value: parseFloat(statusCounts.pending.toFixed(2)), color: "#f59e0b" },
      { name: "Under Review", value: parseFloat(statusCounts.under_review.toFixed(2)), color: "#0ea5e9" },
      { name: "Approved", value: parseFloat(statusCounts.approved.toFixed(2)), color: "#10b981" },
      { name: "Rejected", value: parseFloat(statusCounts.rejected.toFixed(2)), color: "#f43f5e" },
      { name: "Reimbursed", value: parseFloat(statusCounts.reimbursed.toFixed(2)), color: "#a855f7" }
    ].filter(s => s.value > 0);
  };

  const COLORS = ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899", "#8b5cf6"];

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 text-sm">
        <Clock className="h-6 w-6 animate-spin text-indigo-600 mx-auto mb-2" />
        Loading your personal statistics...
      </div>
    );
  }

  return (
    <div id="employee-dashboard-container" className="py-6 px-4 max-w-7xl mx-auto space-y-6">
      {/* Greetings Banner */}
      <div className="bg-slate-900 rounded-2xl p-6 md:p-8 text-white flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-lg relative overflow-hidden border border-slate-800">
        <div className="space-y-1.5 z-10">
          <h2 className="text-2xl font-bold font-sans">Welcome back, {user.name}</h2>
        </div>
        <button
          id="dash-submit-first-btn"
          onClick={onNavigateToSubmit}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/10 transition z-10 cursor-pointer"
        >
          Submit New Claim
        </button>

        {/* Backdrop decoration */}
        <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <span className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <IndianRupee className="h-5 w-5" />
          </span>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">This Month</span>
            <span id="dash-month-total" className="block text-base font-black text-slate-800 font-mono">₹{totalThisMonth.toFixed(2)}</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <span className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">Total Approved</span>
            <span id="dash-approved-total" className="block text-base font-black text-slate-800 font-mono">₹{approvedAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <span className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">Pending Approvals</span>
            <span id="dash-pending-total" className="block text-base font-black text-slate-800 font-mono">₹{pendingAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <span className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">Reimbursed</span>
            <span id="dash-reimbursed-total" className="block text-base font-black text-slate-800 font-mono">₹{reimbursedAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chart 1: Monthly Trend (Full width equivalent or large column) */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4 md:col-span-2">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Annual Monthly Spending Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrendData()}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`₹${value}`, "Amount"]} contentStyle={{ fontSize: "11px", borderRadius: "8px" }} />
                <Area type="monotone" dataKey="Amount" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAmount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Category Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Top 5 categories</h3>
          {categoryData().length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400 italic">No category data yet.</div>
          ) : (
            <div className="h-64 flex flex-col justify-between">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData()}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={60}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `₹${value}`} contentStyle={{ fontSize: "10px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              <div className="space-y-1.5 text-[10px]">
                {categoryData().map((entry, idx) => (
                  <div key={entry.name} className="flex items-center justify-between font-semibold">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-slate-600 truncate max-w-[120px]">{entry.name}</span>
                    </div>
                    <span className="text-slate-800 font-mono">₹{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chart 3 & Recent Claims */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Status Distribution (₹)</h3>
          {statusData().length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-400 italic">No status data yet.</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData()}>
                  <XAxis dataKey="name" fontSize={9} stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <YAxis fontSize={9} stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => `₹${value}`} contentStyle={{ fontSize: "10px" }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {statusData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Recent Claims Table Preview */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4 md:col-span-2">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Recent Expense Claims</h3>
            <button
              id="dash-view-all-claims-btn"
              onClick={onNavigateToExpenses}
              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-500 uppercase tracking-widest cursor-pointer"
            >
              View Full History →
            </button>
          </div>

          {expenses.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 italic">
              You haven't submitted any expense claims yet.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-left border-collapse text-xs min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                    <th className="py-2.5 pr-3 font-sans">Date</th>
                    <th className="py-2.5 px-3 font-sans">Title</th>
                    <th className="py-2.5 px-3 font-sans">Category</th>
                    <th className="py-2.5 px-3 text-right font-sans">Total Claim</th>
                    <th className="py-2.5 pl-3 text-center font-sans">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.slice(0, 4).map(exp => (
                    <tr key={exp.id} className="hover:bg-slate-50/40">
                      <td className="py-3 pr-3 font-mono text-slate-500 font-medium whitespace-nowrap">{exp.date}</td>
                      <td className="py-3 px-3 font-bold text-slate-800 truncate max-w-[140px]">{exp.title}</td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-[10px] font-semibold border border-slate-100">
                          {exp.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-800 font-mono whitespace-nowrap">₹{exp.totalAmount.toFixed(2)}</td>
                      <td className="py-3 pl-3 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          exp.status === "approved" || exp.status === "reimbursed" ? "bg-emerald-50 text-emerald-700" :
                          exp.status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                        }`}>
                          {exp.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
