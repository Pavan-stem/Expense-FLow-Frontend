import React, { useState, useEffect } from "react";
import { 
  getExpenses, 
  subscribeToExpenses,
  getEmployees, 
  addCategory, 

  getCategories, 
  toggleEmployeeAdminRole,
  deleteEmployeeProfile,
  getBillData,
  updateExpense,
  deleteExpense,
  createNotification,
  addVoucherComment,
  deleteVoucherComment,
  clearVoucherCommentsForMonth,
  type EmployeeProfile, 
  type Expense, 
  type ExpenseCategory,
  type VoucherComment
} from "../lib/firebase";
import { 
  collectBillItems, 
  exportBillsToWordDocx, 
  exportBillsToPDF 
} from "../lib/billDocumentGenerator";
import { 
  ShieldAlert, 
  Users, 
  IndianRupee, 
  FileCheck, 
  FolderPlus, 
  TrendingUp, 
  RefreshCw,
  Plus,
  Coins,
  FileMinus,
  Download,
  Eye,
  FileText,
  Filter,
  Check,
  X,
  Calendar,
  Lock,
  ChevronRight,
  Shield,
  Search,
  Trash2,
  MessageSquare,
  Send,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell, 
  Legend, 
  LineChart, 
  Line 
} from "recharts";

interface AdminDashboardProps {
  user: EmployeeProfile;
  onNavigateToQueue: (expenseId?: string) => void;
  refreshTrigger: number;
}

export default function AdminDashboard({ user, onNavigateToQueue, refreshTrigger }: AdminDashboardProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [catMessage, setCatMessage] = useState("");
  const [loading, setLoading] = useState(true);

  // Remarks state inside viewingVoucherDetails modal
  const [adminModalRemark, setAdminModalRemark] = useState("");
  const [sendingRemark, setSendingRemark] = useState(false);

  // Role toggling
  const [roleMessage, setRoleMessage] = useState("");
  const [roleLoadingId, setRoleLoadingId] = useState<string | null>(null);


  // Employee deletion state
  const [deletingEmployee, setDeletingEmployee] = useState<EmployeeProfile | null>(null);
  const [deleteExpensesOption, setDeleteExpensesOption] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");

  // Bill preview / details state
  const [loadingBillId, setLoadingBillId] = useState<string | null>(null);
  const [previewingBill, setPreviewingBill] = useState<{ id: string; fileName: string; fileType: string; fileData?: string } | null>(null);
  const [viewingVoucherDetails, setViewingVoucherDetails] = useState<Expense | null>(null);

  // Voucher deletion state & Admin actions
  const [deletingVoucherExpense, setDeletingVoucherExpense] = useState<Expense | null>(null);
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [activeActionStatus, setActiveActionStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const handleAdminStatusChange = async (expense: Expense, newStatus: Expense["status"]) => {
    setAdminActionLoading(true);
    setActiveActionStatus(newStatus);
    try {
      await updateExpense(expense.id, { status: newStatus }, user.employeeId, user.name);
      await createNotification(
        expense.employeeId,
        `Expense Claim ${newStatus.toUpperCase()}`,
        `Your claim for "${expense.title}" has been set to ${newStatus}.`,
        expense.id,
        expense.voucherNumber
      );
      setExpenses(prev => prev.map(e => e.id === expense.id ? { ...e, status: newStatus } : e));
      if (viewingVoucherDetails?.id === expense.id) {
        setViewingVoucherDetails(prev => prev ? { ...prev, status: newStatus } : null);
      }
      showToast("success", `✓ Claim ${expense.voucherNumber || expense.title} status updated to '${newStatus.replace('_', ' ').toUpperCase()}' successfully.`);
    } catch (err) {
      console.error("Error updating claim status:", err);
      showToast("error", `Failed to update status: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setAdminActionLoading(false);
      setActiveActionStatus(null);
    }
  };

  const confirmDeleteVoucher = async () => {
    if (!deletingVoucherExpense) return;
    const targetTitle = deletingVoucherExpense.title;
    const targetVoucher = deletingVoucherExpense.voucherNumber || "Voucher";
    try {
      await deleteExpense(deletingVoucherExpense.id, user.employeeId, user.name);
      setExpenses(prev => prev.filter(e => e.id !== deletingVoucherExpense.id));
      if (viewingVoucherDetails?.id === deletingVoucherExpense.id) {
        setViewingVoucherDetails(null);
      }
      setDeletingVoucherExpense(null);
      showToast("success", `✓ Expense claim "${targetTitle}" (${targetVoucher}) permanently deleted.`);
    } catch (err) {
      console.error("Error deleting expense:", err);
      showToast("error", `Failed to delete expense claim: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };


  // Localized image zoom & pan state for preview modal
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const handleModalSendRemark = async () => {
    if (!viewingVoucherDetails || !adminModalRemark.trim()) return;
    setSendingRemark(true);
    try {
      const updatedComments = await addVoucherComment(viewingVoucherDetails.id, {
        senderId: user.employeeId,
        senderName: user.name,
        senderRole: user.role,
        message: adminModalRemark
      });

      setViewingVoucherDetails(prev => prev ? {
        ...prev,
        comments: updatedComments,
        status: prev.status === "pending" ? "under_review" : prev.status
      } : null);

      setExpenses(prev => prev.map(e => e.id === viewingVoucherDetails.id ? {
        ...e,
        comments: updatedComments,
        status: e.status === "pending" ? "under_review" : e.status
      } : e));

      setAdminModalRemark("");
    } catch (err) {
      console.error("Error sending remark in modal:", err);
    } finally {
      setSendingRemark(false);
    }
  };

  const handleModalDeleteRemark = async (commentId: string) => {
    if (!viewingVoucherDetails) return;
    try {
      const updatedComments = await deleteVoucherComment(viewingVoucherDetails.id, commentId);

      setViewingVoucherDetails(prev => prev ? {
        ...prev,
        comments: updatedComments
      } : null);

      setExpenses(prev => prev.map(e => e.id === viewingVoucherDetails.id ? {
        ...e,
        comments: updatedComments
      } : e));
    } catch (err) {
      console.error("Error deleting remark in modal:", err);
    }
  };

  const handleModalClearMonthlyRemarks = async () => {
    if (!viewingVoucherDetails) return;
    try {
      const currentMonth = new Date().toLocaleString("default", { month: "long" });
      const currentYear = new Date().getFullYear().toString();
      const updatedComments = await clearVoucherCommentsForMonth(viewingVoucherDetails.id, currentMonth, currentYear);

      setViewingVoucherDetails(prev => prev ? {
        ...prev,
        comments: updatedComments
      } : null);

      setExpenses(prev => prev.map(e => e.id === viewingVoucherDetails.id ? {
        ...e,
        comments: updatedComments
      } : e));
    } catch (err) {
      console.error("Error clearing remarks in modal:", err);
    }
  };

  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  }, [previewingBill]);

  const handleZoomIn = () => setZoomScale(s => Math.min(s + 0.25, 4));
  const handleZoomOut = () => setZoomScale(s => Math.max(s - 0.25, 0.5));
  const handleZoomReset = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanOffset({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsPanning(false);
  };

  const handlePreviewBill = async (expenseId: string, bill: any) => {
    if (bill.fileData) {
      setPreviewingBill(bill);
      return;
    }
    setLoadingBillId(bill.id);
    try {
      const fullData = await getBillData(expenseId, bill.id);
      setPreviewingBill({
        ...bill,
        fileData: fullData
      });
    } catch (err) {
      console.error("Failed to load receipt data for preview:", err);
      alert("Could not load receipt preview.");
    } finally {
      setLoadingBillId(null);
    }
  };

  const handleDownloadBill = async (expenseId: string, bill: any) => {
    let data = bill.fileData;
    if (!data) {
      setLoadingBillId(bill.id);
      try {
        data = await getBillData(expenseId, bill.id);
      } catch (err) {
        console.error("Failed to load receipt data for download:", err);
        setLoadingBillId(null);
        alert("Could not download receipt.");
        return;
      }
      setLoadingBillId(null);
    }
    
    const empName = viewingVoucherDetails?.employeeName || "Employee";
    const sanitizeEmp = empName.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
    const link = document.createElement("a");
    link.href = data;
    link.download = `Receipt_${sanitizeEmp}_${bill.fileName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggleRole = async (targetEmp: EmployeeProfile) => {
    if (targetEmp.employeeId === user.employeeId || targetEmp.email.toLowerCase().trim() === user.email.toLowerCase().trim()) {
      setRoleMessage("Cannot modify your own administrative privileges.");
      return;
    }
    setRoleLoadingId(targetEmp.employeeId);
    setRoleMessage("");
    try {
      const success = await toggleEmployeeAdminRole(targetEmp.employeeId, user.email);
      if (success) {
        setRoleMessage(`Successfully updated administrative role for ${targetEmp.name}.`);
        const empData = await getEmployees();
        setEmployees(empData.filter(e => e.email.toLowerCase().trim() !== "stem.admin@gmail.com" && e.employeeId !== "ADM_STEM"));
      } else {
        setRoleMessage("Failed to update user authorization role.");
      }
    } catch (err: any) {
      setRoleMessage(err.message || "Error processing permission adjustment.");
    } finally {
      setRoleLoadingId(null);
    }
  };

  const handleConfirmDeleteEmployee = async () => {
    if (!deletingEmployee) return;
    setDeleteLoading(true);
    setDeleteMessage("");
    try {
      const success = await deleteEmployeeProfile(
        deletingEmployee.employeeId,
        user.employeeId,
        user.name,
        deleteExpensesOption
      );
      if (success) {
        const empData = await getEmployees();
        setEmployees(empData.filter(e => e.email.toLowerCase().trim() !== "stem.admin@gmail.com" && e.employeeId !== "ADM_STEM"));
        const expData = await getExpenses();
        setExpenses(expData);
        setDeletingEmployee(null);
        setDeleteExpensesOption(false);
        setRoleMessage(`Successfully deleted employee profile and data for ${deletingEmployee.name}.`);
      } else {
        setDeleteMessage("Failed to delete the employee profile.");
      }
    } catch (err: any) {
      setDeleteMessage(err.message || "Error deleting employee profile.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatDateForExcel = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const expData = await getExpenses();
      setExpenses(expData);

      const empData = await getEmployees();
      setEmployees(empData.filter(e => e.email.toLowerCase().trim() !== "stem.admin@gmail.com" && e.employeeId !== "ADM_STEM"));


      const catData = await getCategories();
      setCategories(catData);
    } catch (err) {
      console.error("Error loading admin stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToExpenses((updatedExpenses) => {
      setExpenses(updatedExpenses);
      setLoading(false);
    });

    getEmployees().then(empData => {
      setEmployees(empData.filter(e => e.email.toLowerCase().trim() !== "stem.admin@gmail.com" && e.employeeId !== "ADM_STEM"));
    });

    getCategories().then(catData => {
      setCategories(catData);
    });

    return () => unsub();
  }, [refreshTrigger]);


  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setCatMessage("");
    try {
      const added = await addCategory(newCatName.trim());
      if (added) {
        setCategories(prev => [...prev, added]);
        setCatMessage(`Category "${newCatName}" added successfully.`);
        setNewCatName("");
      } else {
        setCatMessage("Failed to add category.");
      }
    } catch (err) {
      setCatMessage("Error occurred while adding category.");
    }
  };

  // KPI Calculations
  const totalEmployees = employees.length;
  const totalClaims = expenses.length;
  
  const pendingClaimsCount = expenses.filter(e => e.status === "pending" || e.status === "under_review").length;
  
  const totalApprovedAmount = expenses
    .filter(e => e.status === "approved" || e.status === "reimbursed")
    .reduce((sum, e) => sum + e.totalAmount, 0);

  const totalRejectedAmount = expenses
    .filter(e => e.status === "rejected")
    .reduce((sum, e) => sum + e.totalAmount, 0);

  // Spending for current month
  const currentMonthName = new Date().toLocaleString("default", { month: "long" });
  const currentYear = new Date().getFullYear();
  const currentMonthSpending = expenses
    .filter(exp => {
      const d = new Date(exp.date);
      return d.toLocaleString("default", { month: "long" }) === currentMonthName && d.getFullYear() === currentYear;
    })
    .reduce((sum, e) => sum + e.totalAmount, 0);

  // Charts data
  // 1. Monthly Expenses
  const monthlyExpensesData = () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const currentYr = now.getFullYear();

    return months.map((m, idx) => {
      const monthExpenses = expenses.filter(exp => {
        const d = new Date(exp.date);
        return d.getMonth() === idx && d.getFullYear() === currentYr;
      });
      const total = monthExpenses.reduce((sum, exp) => sum + exp.totalAmount, 0);
      return { name: m, TotalSpent: parseFloat(total.toFixed(2)) };
    });
  };

  // 2. Employee-wise spending
  const employeeSpendingData = () => {
    const empMap: { [key: string]: { name: string, amount: number } } = {};
    expenses.forEach(e => {
      // Find matching employee profile if available to get canonical name/ID
      const matchedProfile = employees.find(emp => 
        (emp.email && e.employeeEmail && emp.email.toLowerCase().trim() === e.employeeEmail.toLowerCase().trim()) ||
        (emp.employeeId && e.employeeId && emp.employeeId.toLowerCase().trim() === e.employeeId.toLowerCase().trim()) ||
        (emp.name && e.employeeName && emp.name.toLowerCase().trim() === e.employeeName.toLowerCase().trim())
      );

      const rawName = matchedProfile?.name || e.employeeName || e.employeeId || "Employee";
      const cleanKey = (matchedProfile?.email || rawName).toLowerCase().trim();

      const formattedName = matchedProfile?.name || 
        (rawName.trim().charAt(0).toUpperCase() + rawName.trim().slice(1));

      if (!empMap[cleanKey]) {
        empMap[cleanKey] = { name: formattedName, amount: 0 };
      }
      empMap[cleanKey].amount += (e.totalAmount || e.amount || 0);
    });

    return Object.values(empMap)
      .map(v => ({ name: v.name, Spent: parseFloat(v.amount.toFixed(2)) }))
      .sort((a, b) => b.Spent - a.Spent)
      .slice(0, 6);
  };

  // 3. Category-wise Expenses
  const categorySpendingData = () => {
    const catMap: { [key: string]: number } = {};
    expenses.forEach(e => {
      catMap[e.category] = (catMap[e.category] || 0) + e.totalAmount;
    });

    return Object.keys(catMap).map(k => ({
      name: k,
      value: parseFloat(catMap[k].toFixed(2))
    })).sort((a, b) => b.value - a.value);
  };

  // 4. Approval stats
  const approvalStatsData = () => {
    const statusCounts = { pending: 0, under_review: 0, approved: 0, rejected: 0, reimbursed: 0 };
    expenses.forEach(e => {
      if (statusCounts[e.status] !== undefined) {
        statusCounts[e.status]++;
      }
    });

    return [
      { name: "Pending", count: statusCounts.pending, fill: "#f59e0b" },
      { name: "Under Review", count: statusCounts.under_review, fill: "#0ea5e9" },
      { name: "Approved", count: statusCounts.approved, fill: "#10b981" },
      { name: "Rejected", count: statusCounts.rejected, fill: "#f43f5e" },
      { name: "Reimbursed", count: statusCounts.reimbursed, fill: "#a855f7" }
    ].filter(s => s.count > 0);
  };

  const COLORS = ["#4f46e5", "#06b6d4", "#f59e0b", "#ec4899", "#8b5cf6", "#10b981", "#64748b"];

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 text-sm">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600 mx-auto mb-2" />
        Compiling organizational reports...
      </div>
    );
  }

  return (
    <div id="admin-dashboard-container" className="py-6 px-4 max-w-7xl mx-auto space-y-6 relative">
      {/* Floating Toast Notification Banner */}
      {toast && (
        <div
          id="admin-toast-banner"
          className={`fixed top-5 right-5 z-[120] max-w-md px-5 py-3.5 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-md transition-all duration-200 ${
            toast.type === "success" 
              ? "bg-emerald-900/95 text-emerald-100 border-emerald-700/80 shadow-emerald-900/30" 
              : "bg-rose-900/95 text-rose-100 border-rose-700/80 shadow-rose-900/30"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0" />
          )}
          <span className="text-xs font-bold font-sans tracking-wide leading-tight">{toast.message}</span>
          <button 
            type="button" 
            onClick={() => setToast(null)}
            className="ml-auto text-slate-300 hover:text-white transition p-1 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Greetings Banner */}
      <div className="bg-slate-900 rounded-2xl p-6 md:p-8 text-white flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-lg border border-slate-800">
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-widest font-bold text-indigo-400">Administration Portal</span>
          <h2 className="text-2xl font-bold font-sans">Corporate Spending & Claims Audit</h2>
        </div>

        <div>
          {pendingClaimsCount > 0 ? (
            <button
              id="dash-navigate-queue"
              onClick={() => onNavigateToQueue()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/10 transition cursor-pointer flex items-center gap-1.5"
            >
              <ShieldAlert className="h-4 w-4 animate-bounce" />
              Review {pendingClaimsCount} Pending Claims
            </button>
          ) : (
            <span className="text-xs font-bold text-slate-400 bg-slate-800 px-4 py-2 rounded-xl">
              ✓ Claim Queue Clear
            </span>
          )}
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {/* KPI 1 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <Users className="h-4 w-4 text-indigo-600" />
            <span className="text-[9px] uppercase font-bold tracking-wider">Staff Count</span>
          </div>
          <span className="block text-lg font-black text-slate-800 mt-2 font-mono">{totalEmployees}</span>
        </div>

        {/* KPI 2 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <FileCheck className="h-4 w-4 text-emerald-600" />
            <span className="text-[9px] uppercase font-bold tracking-wider">Claims Sent</span>
          </div>
          <span className="block text-lg font-black text-slate-800 mt-2 font-mono">{totalClaims}</span>
        </div>

        {/* KPI 3 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <Coins className="h-4 w-4 text-purple-600" />
            <span className="text-[9px] uppercase font-bold tracking-wider">Approved (₹)</span>
          </div>
          <span className="block text-lg font-black text-slate-800 mt-2 font-mono">₹{totalApprovedAmount.toFixed(2)}</span>
        </div>

        {/* KPI 4 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <span className="text-[9px] uppercase font-bold tracking-wider">Pending Audit</span>
          </div>
          <span className="block text-lg font-black text-slate-800 mt-2 font-mono">{pendingClaimsCount}</span>
        </div>

        {/* KPI 5 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <FileMinus className="h-4 w-4 text-rose-600" />
            <span className="text-[9px] uppercase font-bold tracking-wider">Rejected (₹)</span>
          </div>
          <span className="block text-lg font-black text-slate-800 mt-2 font-mono">₹{totalRejectedAmount.toFixed(2)}</span>
        </div>

        {/* KPI 6 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <TrendingUp className="h-4 w-4 text-teal-600" />
            <span className="text-[9px] uppercase font-bold tracking-wider">Month Spent</span>
          </div>
          <span className="block text-lg font-black text-slate-800 mt-2 font-mono">₹{currentMonthSpending.toFixed(2)}</span>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Monthly Expenditures */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4 lg:col-span-2">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Monthly Spend Trends</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyExpensesData()}>
                <XAxis dataKey="name" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`₹${value}`, "Amount"]} contentStyle={{ fontSize: "11px", borderRadius: "8px" }} />
                <Line type="monotone" dataKey="TotalSpent" stroke="#4f46e5" strokeWidth={3} dot={{ fill: "#4f46e5" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Component: Add Category & Category List */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-50 pb-2.5 mb-3">
              <FolderPlus className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Manage categories</h3>
            </div>

            <form onSubmit={handleAddCategory} className="space-y-3">
              <div>
                <input
                  id="admin-new-cat-input"
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Health Benefits"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white text-xs outline-none"
                />
              </div>
              <button
                id="admin-add-cat-btn"
                type="submit"
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add Category
              </button>
            </form>

            {catMessage && (
              <p id="admin-cat-alert" className="text-[10px] text-emerald-600 font-semibold mt-2">{catMessage}</p>
            )}
          </div>

          <div className="flex-1 mt-4 overflow-y-auto max-h-36 border-t border-slate-50 pt-3">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Category list</span>
            <div className="flex flex-wrap gap-1.5">
              {categories.map(cat => (
                <span key={cat.id} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-semibold border border-slate-200/50">
                  {cat.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 2: Employee Spending comparison */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Top 6 Employee Expenses</h3>
          {employeeSpendingData().length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-400 italic">No employee expense logs.</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeeSpendingData()} layout="vertical">
                  <XAxis type="number" fontSize={9} stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" fontSize={9} stroke="#94a3b8" tickLine={false} axisLine={false} width={60} />
                  <Tooltip formatter={(value) => `₹${value}`} contentStyle={{ fontSize: "10px" }} />
                  <Bar dataKey="Spent" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 3: Category Wise Spending */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Enterprise spending by category</h3>
          {categorySpendingData().length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-400 italic">No spending logs.</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categorySpendingData()}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={55}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categorySpendingData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `₹${value}`} contentStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-[8px] mt-1 text-slate-500 font-semibold max-h-12 overflow-y-auto">
                {categorySpendingData().map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span>{entry.name}: ₹{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart 4: Approval Statistics */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Claim Approval Statistics (Count)</h3>
          {approvalStatsData().length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-400 italic">No historical status records.</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={approvalStatsData()}>
                  <XAxis dataKey="name" fontSize={9} stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <YAxis fontSize={9} stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => [`${value} Claims`, "Quantity"]} contentStyle={{ fontSize: "10px" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {approvalStatsData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* NEW: Team Roles, Access Controls & Employee Registry Panel */}
      {user.role === "admin" && (
        <div id="stem-admin-roles-panel" className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-6 shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-5">
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-indigo-600 text-white rounded-xl">
                <Lock className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold tracking-wider">Administrative Roles, Permissions & Team Management</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Manage corporate team profiles, assign administrative capabilities, or delete redundant accounts.</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-indigo-950 text-indigo-400 border border-indigo-800 rounded-full text-[10px] font-bold font-mono uppercase">
              Admin Console
            </span>

          </div>

          {roleMessage && (
            <div id="role-feedback-banner" className="p-3 bg-indigo-950/50 border border-indigo-800/50 text-indigo-300 text-xs font-semibold rounded-xl flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-indigo-400 flex-shrink-0" />
              <span>{roleMessage}</span>
            </div>
          )}

          <div className="overflow-hidden border border-slate-800 rounded-xl bg-slate-950/30">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider font-bold">
                    <th className="py-3 px-4 font-sans">Employee Details</th>
                    <th className="py-3 px-4 font-sans">Email Address</th>
                    <th className="py-3 px-4 text-center font-sans">Current Role</th>
                    <th className="py-3 px-6 text-center font-sans">Administrative Toggle</th>
                    <th className="py-3 px-4 text-center font-sans">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-xs text-slate-300">
                  {employees.map(emp => {
                    const isSelf = emp.email.toLowerCase().trim() === user.email.toLowerCase().trim() || emp.employeeId === user.employeeId;
                    const isAdmin = emp.role === "admin";
                    const canDelete = !isSelf;
                    return (
                      <tr key={emp.employeeId} className="hover:bg-slate-900/20 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{emp.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{emp.employeeId}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{emp.email}</td>
                        <td className="py-3 px-4 text-center">
                          {isAdmin ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-950 text-indigo-400 rounded text-[10px] font-bold border border-indigo-800">
                              <Shield className="h-2.5 w-2.5" /> ADMIN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] font-bold border border-slate-700">
                              EMPLOYEE
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-6 text-center">
                          {isSelf ? (
                            <span className="text-[10px] text-slate-500 font-medium italic">Your Profile</span>
                          ) : (
                            <button
                              id={`toggle-role-btn-${emp.employeeId}`}
                              onClick={() => handleToggleRole(emp)}
                              disabled={roleLoadingId !== null}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider transition uppercase cursor-pointer ${
                                isAdmin
                                  ? "bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800"
                                  : "bg-indigo-900 hover:bg-indigo-800 text-indigo-300 border border-indigo-700"
                              }`}
                            >
                              {roleLoadingId === emp.employeeId ? (
                                <RefreshCw className="h-3 w-3 animate-spin mx-auto" />
                              ) : isAdmin ? (
                                "Demote to Employee"
                              ) : (
                                "Promote to Admin"
                              )}
                            </button>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {canDelete ? (
                            <button
                              id={`delete-emp-btn-${emp.employeeId}`}
                              onClick={() => {
                                setDeletingEmployee(emp);
                                setDeleteExpensesOption(false);
                                setDeleteMessage("");
                              }}
                              className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/60 rounded-lg hover:text-rose-200 transition cursor-pointer flex items-center justify-center mx-auto"
                              title="Delete Employee"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-600 font-medium italic">N/A</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM MODAL: Delete Employee Confirmation */}
      {deletingEmployee && (
        <div id="delete-employee-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <span className="p-2 bg-rose-950 rounded-xl">
                <Trash2 className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-base font-bold">Delete Employee Profile</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">This action is irreversible.</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 space-y-2">
              <p>
                Are you sure you want to delete the employee profile for{" "}
                <span className="font-bold text-white">{deletingEmployee.name}</span> (ID:{" "}
                <span className="font-mono text-indigo-400">{deletingEmployee.employeeId}</span>)?
              </p>
              <p className="text-slate-400">
                They will no longer be able to log in or submit expense claims, and will be removed from all dropdown filters.
              </p>
            </div>

            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  id="delete-expenses-checkbox"
                  type="checkbox"
                  checked={deleteExpensesOption}
                  onChange={(e) => setDeleteExpensesOption(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-800 text-rose-600 focus:ring-rose-500 h-3.5 w-3.5 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-200 block">Delete associated expense claims</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Check this to permanently purge all existing expense claims logged by this employee.
                  </span>
                </div>
              </label>
            </div>

            {deleteMessage && (
              <div className="p-3 bg-rose-950/30 border border-rose-900/50 text-rose-300 text-xs rounded-xl font-medium">
                {deleteMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                id="cancel-delete-emp-btn"
                onClick={() => setDeletingEmployee(null)}
                disabled={deleteLoading}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-emp-btn"
                onClick={handleConfirmDeleteEmployee}
                disabled={deleteLoading}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleteLoading ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  "Delete Employee"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL: Voucher Claim Specifications */}
      {viewingVoucherDetails && (
        <div id="voucher-details-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-widest font-bold text-indigo-400 font-mono">Claim voucher Details</span>
                <h4 className="text-base font-bold font-sans">{viewingVoucherDetails.voucherNumber || "Voucher Claim File"}</h4>
              </div>
              <button
                id="close-voucher-modal-btn"
                onClick={() => setViewingVoucherDetails(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Employee Name</span>
                  <p className="text-slate-800 font-semibold">{viewingVoucherDetails.employeeName}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Employee ID</span>
                  <p className="text-slate-800 font-mono">{viewingVoucherDetails.employeeId}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Claim Title</span>
                  <p className="text-slate-800 font-semibold">{viewingVoucherDetails.title}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Category</span>
                  <p className="text-indigo-600 font-bold">{viewingVoucherDetails.category}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Claim Date</span>
                  <p className="text-slate-800 font-semibold font-mono">{viewingVoucherDetails.date}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Vendor / Payee</span>
                  <p className="text-slate-800 font-semibold">{viewingVoucherDetails.vendor}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Base Amount</span>
                  <p className="text-slate-800 font-bold">₹{viewingVoucherDetails.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">GST Amount</span>
                  <p className="text-slate-800 font-bold">₹{(viewingVoucherDetails.gstAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="col-span-2 border-t border-slate-50 pt-3 flex justify-between items-center bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Claim Value (INR)</span>
                  <span className="text-sm font-bold text-indigo-600">₹{viewingVoucherDetails.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Payment Method</span>
                  <p className="text-slate-800 font-semibold uppercase font-mono">{viewingVoucherDetails.paymentMethod}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Claim Status</span>
                  <span className="inline-block mt-0.5 px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-full border border-indigo-100 uppercase">
                    {viewingVoucherDetails.status}
                  </span>
                </div>
              </div>

              {viewingVoucherDetails.adminComments && (
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs space-y-1">
                  <span className="block font-bold text-indigo-900">Decision comments:</span>
                  <p className="text-indigo-800 leading-relaxed font-medium">{viewingVoucherDetails.adminComments}</p>
                </div>
              )}

              {/* Voucher Remarks & Clarification Thread */}
              <div id="admin-modal-remarks-thread" className="border-t border-slate-100 pt-5 space-y-3">
                {(() => {
                  const currentMonth = new Date().toLocaleString("default", { month: "long" });
                  const currentYear = new Date().getFullYear().toString();
                  const currentMonthComments = (viewingVoucherDetails.comments || []).filter(cmt => {
                    if (!cmt.timestamp) return true;
                    const cmtDate = new Date(cmt.timestamp);
                    const cmtMonth = cmtDate.toLocaleString("default", { month: "long" });
                    const cmtYear = cmtDate.getFullYear().toString();
                    return cmtMonth === currentMonth && cmtYear === currentYear;
                  });

                  return (
                    <>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-indigo-600" />
                          <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Voucher Remarks ({currentMonthComments.length})
                          </h5>
                        </div>
                        <div className="flex items-center gap-3">
                          {currentMonthComments.length > 0 && (
                            <button
                              type="button"
                              onClick={handleModalClearMonthlyRemarks}
                              className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer transition"
                              title="Delete all remarks for this month"
                            >
                              <Trash2 className="h-3 w-3" /> Clear Monthly Remarks
                            </button>
                          )}
                          <span className="text-[10px] text-slate-400">Write remarks or ask employee for clarification</span>
                        </div>
                      </div>

                      {currentMonthComments.length === 0 ? (
                        <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                          No remarks or comments on this voucher bill for {currentMonth} yet.
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                          {currentMonthComments.map(cmt => (
                            <div 
                              key={cmt.id} 
                              className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 text-slate-900 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold">{cmt.senderName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {new Date(cmt.timestamp).toLocaleDateString()} {new Date(cmt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {(cmt.senderId === user.employeeId || user.role === "admin") && (
                                    <button
                                      type="button"
                                      onClick={() => handleModalDeleteRemark(cmt.id)}
                                      className="text-slate-400 hover:text-red-600 transition p-1 cursor-pointer"
                                      title="Delete message"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs leading-relaxed whitespace-pre-wrap">{cmt.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}

                <div className="space-y-2 pt-1">
                  <textarea
                    id="admin-modal-remark-input"
                    value={adminModalRemark}
                    onChange={(e) => setAdminModalRemark(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!sendingRemark && adminModalRemark.trim()) {
                          handleModalSendRemark();
                        }
                      }
                    }}
                    placeholder="Write a remark, question, or clarification for the employee... (Press Enter to send)"
                    rows={2}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 text-xs outline-none transition resize-none shadow-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      id="admin-modal-send-remark-btn"
                      type="button"
                      onClick={handleModalSendRemark}
                      disabled={sendingRemark || !adminModalRemark.trim()}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      {sendingRemark ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send
                    </button>
                  </div>
                </div>
              </div>

              {/* Receipts inside the detail modal */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold text-slate-700">Digital Invoices & Attachments ({viewingVoucherDetails.bills ? viewingVoucherDetails.bills.length : 0})</h5>
                {!viewingVoucherDetails.bills || viewingVoucherDetails.bills.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No document file attachments uploaded.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {viewingVoucherDetails.bills.map(bill => (
                      <div key={bill.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{bill.fileName}</p>
                            <p className="text-[9px] text-slate-400 uppercase font-mono">{bill.fileType.split("/")[1] || "File"}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            id={`modal-preview-bill-${bill.id}`}
                            onClick={() => handlePreviewBill(viewingVoucherDetails.id, bill)}
                            disabled={loadingBillId !== null}
                            className="p-1 text-indigo-600 hover:text-indigo-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
                            title="Preview File"
                          >
                            {loadingBillId === bill.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            id={`modal-download-bill-${bill.id}`}
                            onClick={() => handleDownloadBill(viewingVoucherDetails.id, bill)}
                            disabled={loadingBillId !== null}
                            className="p-1 text-slate-600 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
                            title="Download File"
                          >
                            {loadingBillId === bill.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer with Status Actions & Delete */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <button
                id="admin-modal-delete-voucher-btn"
                type="button"
                onClick={() => setDeletingVoucherExpense(viewingVoucherDetails)}
                disabled={adminActionLoading}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Voucher
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  id="admin-modal-reject-btn"
                  type="button"
                  onClick={() => handleAdminStatusChange(viewingVoucherDetails, "rejected")}
                  disabled={adminActionLoading}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  {activeActionStatus === "rejected" && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Reject
                </button>
                <button
                  id="admin-modal-under-review-btn"
                  type="button"
                  onClick={() => handleAdminStatusChange(viewingVoucherDetails, "under_review")}
                  disabled={adminActionLoading}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  {activeActionStatus === "under_review" && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Under Review
                </button>
                <button
                  id="admin-modal-approve-btn"
                  type="button"
                  onClick={() => handleAdminStatusChange(viewingVoucherDetails, "approved")}
                  disabled={adminActionLoading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  {activeActionStatus === "approved" && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Approve
                </button>
                <button
                  id="admin-modal-reimburse-btn"
                  type="button"
                  onClick={() => handleAdminStatusChange(viewingVoucherDetails, "reimbursed")}
                  disabled={adminActionLoading}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  {activeActionStatus === "reimbursed" && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Reimburse
                </button>
                <button
                  id="close-voucher-modal-footer-btn"
                  onClick={() => setViewingVoucherDetails(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer ml-2"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Voucher Confirmation Dialog Modal */}
      {deletingVoucherExpense && (
        <div id="admin-delete-voucher-backdrop" className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div id="admin-delete-voucher-modal" className="w-full max-w-md bg-white border border-slate-100 rounded-3xl shadow-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl flex-shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Delete Voucher Claim permanently?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to delete <span className="font-bold">"{deletingVoucherExpense.voucherNumber || deletingVoucherExpense.title}"</span>? This will permanently remove the voucher, all attached receipts, and recalculate monthly sequence numbers.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingVoucherExpense(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteVoucher}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white rounded-xl transition shadow-md cursor-pointer"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Document File Attachment Previewer */}
      {previewingBill && (
        <div id="receipt-attachment-previewer" className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-55">
          <div className="w-full max-w-4xl bg-slate-950 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[90vh]">
            {/* Previewer Header */}
            <div className="p-4 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-bold truncate max-w-md">{previewingBill.fileName}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  id="preview-zoom-out-btn"
                  onClick={handleZoomOut}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                  title="Zoom Out"
                >
                  <span className="text-xs font-bold font-mono">-</span>
                </button>
                <button
                  id="preview-zoom-reset-btn"
                  onClick={handleZoomReset}
                  className="px-2 py-1 text-[10px] font-bold font-mono text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                >
                  {Math.round(zoomScale * 100)}%
                </button>
                <button
                  id="preview-zoom-in-btn"
                  onClick={handleZoomIn}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                  title="Zoom In"
                >
                  <span className="text-xs font-bold font-mono">+</span>
                </button>
                <button
                  id="preview-download-btn"
                  onClick={() => {
                    const empName = viewingVoucherDetails?.employeeName || "Employee";
                    const sanitizeEmp = empName.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
                    const link = document.createElement("a");
                    link.href = previewingBill.fileData || "";
                    link.download = `Receipt_${sanitizeEmp}_${previewingBill.fileName}`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                  title="Download Raw File"
                >
                  <Download className="h-4 w-4" />
                </button>
                <div className="h-4 w-px bg-slate-800 mx-1" />
                <button
                  id="close-preview-modal-btn"
                  onClick={() => setPreviewingBill(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Previewer Workspace Area */}
            <div 
              className="flex-1 overflow-hidden relative flex items-center justify-center p-4 bg-slate-900 select-none cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
            >
              {previewingBill.fileType.startsWith("image/") ? (
                <div 
                  className="transition-transform duration-100 ease-out origin-center"
                  style={{
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`
                  }}
                >
                  <img
                    src={previewingBill.fileData}
                    alt={previewingBill.fileName}
                    referrerPolicy="no-referrer"
                    className="max-h-[70vh] max-w-full object-contain shadow-lg"
                    draggable={false}
                  />
                </div>
              ) : previewingBill.fileType === "application/pdf" ? (
                <iframe
                  src={previewingBill.fileData}
                  title="PDF Attachment Preview"
                  className="w-full h-full border-none rounded-lg bg-white"
                />
              ) : (
                <div className="text-center text-slate-400 space-y-4">
                  <FileMinus className="h-12 w-12 text-slate-600 mx-auto" />
                  <div>
                    <p className="text-sm font-bold text-white">Non-viewable document file type</p>
                    <p className="text-xs mt-1">Directly download the file to inspect the local attachment.</p>
                  </div>
                  <button
                    id="nonviewable-download-btn"
                    onClick={() => {
                      const empName = viewingVoucherDetails?.employeeName || "Employee";
                      const sanitizeEmp = empName.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
                      const link = document.createElement("a");
                      link.href = previewingBill.fileData || "";
                      link.download = `Receipt_${sanitizeEmp}_${previewingBill.fileName}`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                  >
                    Download Invoice File
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
