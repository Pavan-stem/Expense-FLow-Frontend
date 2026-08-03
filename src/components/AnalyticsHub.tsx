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
import { BarChart2, TrendingUp, Award, IndianRupee, Wallet, RefreshCw } from "lucide-react";

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

  // Calculations
  const averageClaim = expenses.length > 0 
    ? parseFloat((expenses.reduce((sum, e) => sum + e.totalAmount, 0) / expenses.length).toFixed(2))
    : 0;

  const maxClaim = expenses.length > 0
    ? Math.max(...expenses.map(e => e.totalAmount))
    : 0;

  // Chart: Type of Expense Spending (Category)
  const expenseTypeSpendingData = () => {
    const totals: { [key: string]: number } = {};
    expenses.forEach(e => {
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
    expenses.forEach(e => {
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

      {/* Numerical Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <span className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <IndianRupee className="h-5 w-5" />
          </span>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">Average Claim Size</span>
            <span className="block text-xl font-black text-slate-800 font-mono">₹{averageClaim.toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <span className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Award className="h-5 w-5" />
          </span>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">Highest Claim Submitted</span>
            <span className="block text-xl font-black text-slate-800 font-mono">₹{maxClaim.toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <span className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">Total Audit Volume</span>
            <span className="block text-xl font-black text-slate-800 font-mono">{expenses.length} claims</span>
          </div>
        </div>
      </div>

      {/* Main comparative graphs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Expense Type Spending */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-50 pb-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Spending by Type of Expense
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
