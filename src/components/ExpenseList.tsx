import React, { useState, useEffect } from "react";
import { 
  getExpenses, 
  getExpensesByEmployee, 
  subscribeToExpenses,
  subscribeToExpensesByEmployee,
  updateExpense, 
  deleteExpense,

  getCategories,
  createNotification,
  getBillData,
  addVoucherComment,
  deleteVoucherComment,
  clearVoucherCommentsForMonth,
  markExpenseNotificationsAsRead,
  type EmployeeProfile, 
  type Expense, 
  type ExpenseCategory,
  type BillFile,
  type VoucherComment
} from "../lib/firebase";
import { 
  collectBillItems, 
  exportBillsToWordDocx, 
  exportBillsToPDF 
} from "../lib/billDocumentGenerator";
import { 
  Search, 
  Filter, 
  ChevronRight, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Download, 
  Trash2, 
  Edit3, 
  Eye, 
  FileText, 
  RefreshCw,
  FolderMinus,
  Check,
  ChevronDown,
  Info,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MessageSquare,
  Send
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ExpenseListProps {
  user: EmployeeProfile;
  refreshTrigger: number;
  targetExpenseId?: string | null;
  onClearTargetExpense?: () => void;
}

export default function ExpenseList({ user, refreshTrigger, targetExpenseId, onClearTargetExpense }: ExpenseListProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewingBill, setPreviewingBill] = useState<BillFile | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  // Localized image zoom & pan state for preview modal
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Voucher Remark / Comment state
  const [newRemarkText, setNewRemarkText] = useState("");
  const [postingRemark, setPostingRemark] = useState(false);

  // Admin action & feedback state
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [activeActionStatus, setActiveActionStatus] = useState<string | null>(null);
  const [adminComment, setAdminComment] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Reset zoom and pan when previewingBill changes
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
  
  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterMonth, setFilterMonth] = useState(new Date().toLocaleString("default", { month: "long" }));
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Detailed Modal states
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [loadingBillId, setLoadingBillId] = useState<string | null>(null);

  // Track viewed expense timestamps to manage unread badges
  const [viewedExpenseTimestamps, setViewedExpenseTimestamps] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(`viewed_expenses_${user.employeeId}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const markExpenseAsViewed = React.useCallback((expenseId: string, voucherNumber?: string) => {
    const now = Date.now();
    setViewedExpenseTimestamps(prev => {
      const updated = { ...prev, [expenseId]: now };
      try {
        localStorage.setItem(`viewed_expenses_${user.employeeId}`, JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });

    // Mark notifications for this bill as read in database
    markExpenseNotificationsAsRead(user.employeeId, expenseId, voucherNumber);
  }, [user.employeeId]);

  useEffect(() => {
    if (selectedExpense) {
      markExpenseAsViewed(selectedExpense.id, selectedExpense.voucherNumber);
    }
  }, [selectedExpense, markExpenseAsViewed]);

  const getUnreadCommentsCount = (exp: Expense) => {
    if (!exp.comments || exp.comments.length === 0) return 0;
    const lastViewed = viewedExpenseTimestamps[exp.id] || 0;
    const unread = exp.comments.filter(cmt => {
      const cmtTime = new Date(cmt.timestamp).getTime();
      return cmt.senderId !== user.employeeId && cmtTime > lastViewed;
    });
    return unread.length;
  };

  // Bulk Approval states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Fetch all data
  const fetchData = async () => {
    setLoading(true);
    try {
      let data: Expense[] = [];
      if (user.role === "admin") {
        data = await getExpenses();
      } else {
        data = await getExpensesByEmployee(user.employeeId);
      }
      setExpenses(data);
      
      const cats = await getCategories();
      setCategories(cats);
    } catch (err) {
      console.error("Error loading expenses list:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const unsub = user.role === "admin"
      ? subscribeToExpenses((updatedData) => {
          setExpenses(updatedData);
          setLoading(false);
        })
      : subscribeToExpensesByEmployee(user.employeeId, (updatedData) => {
          setExpenses(updatedData);
          setLoading(false);
        });

    getCategories().then(cats => setCategories(cats));

    return () => unsub();
  }, [user.employeeId, user.role, refreshTrigger]);


  // Auto-open target expense if navigated via notification
  useEffect(() => {
    if (targetExpenseId && expenses.length > 0) {
      const match = expenses.find(e => e.id === targetExpenseId || e.voucherNumber === targetExpenseId);
      if (match) {
        setSelectedExpense(match);
        if (onClearTargetExpense) {
          onClearTargetExpense();
        }
      }
    }
  }, [targetExpenseId, expenses]);

  const handleSendRemark = async () => {
    if (!selectedExpense || !newRemarkText.trim()) return;
    setPostingRemark(true);
    try {
      const updatedComments = await addVoucherComment(selectedExpense.id, {
        senderId: user.employeeId,
        senderName: user.name,
        senderRole: user.role,
        message: newRemarkText
      });

      // Update selected expense modal locally
      setSelectedExpense(prev => prev ? {
        ...prev,
        comments: updatedComments,
        ...(user.role === "admin" && prev.status === "pending" ? { status: "under_review" } : {})
      } : null);

      // Update expenses list locally
      setExpenses(prev => prev.map(e => e.id === selectedExpense.id ? {
        ...e,
        comments: updatedComments,
        ...(user.role === "admin" && e.status === "pending" ? { status: "under_review" } : {})
      } : e));

      setNewRemarkText("");
    } catch (err) {
      console.error("Error sending voucher remark:", err);
    } finally {
      setPostingRemark(false);
    }
  };

  const handleDeleteRemark = async (commentId: string) => {
    if (!selectedExpense) return;
    try {
      const updatedComments = await deleteVoucherComment(selectedExpense.id, commentId);

      setSelectedExpense(prev => prev ? {
        ...prev,
        comments: updatedComments
      } : null);

      setExpenses(prev => prev.map(e => e.id === selectedExpense.id ? {
        ...e,
        comments: updatedComments
      } : e));
    } catch (err) {
      console.error("Error deleting remark:", err);
    }
  };

  const handleClearMonthlyRemarks = async () => {
    if (!selectedExpense) return;
    try {
      const activeMonth = filterMonth || new Date().toLocaleString("default", { month: "long" });
      const activeYear = filterYear || new Date().getFullYear().toString();
      const updatedComments = await clearVoucherCommentsForMonth(selectedExpense.id, activeMonth, activeYear);

      setSelectedExpense(prev => prev ? {
        ...prev,
        comments: updatedComments
      } : null);

      setExpenses(prev => prev.map(e => e.id === selectedExpense.id ? {
        ...e,
        comments: updatedComments
      } : e));
    } catch (err) {
      console.error("Error clearing monthly remarks:", err);
    }
  };

  const handleStatusChange = async (expense: Expense, newStatus: Expense["status"], customComment?: string) => {
    setAdminActionLoading(true);
    setActiveActionStatus(newStatus);
    try {
      const commentToSave = customComment !== undefined ? customComment : adminComment;
      await updateExpense(expense.id, {
        status: newStatus,
        adminComments: commentToSave || undefined
      }, user.employeeId, user.name);

      // Create notification for employee
      await createNotification(
        expense.employeeId,
        `Expense Claim ${newStatus.toUpperCase()}`,
        `Your claim for "${expense.title}" has been set to ${newStatus}.`,
        expense.id,
        expense.voucherNumber
      );

      // Locally update state
      setExpenses(prev => prev.map(e => e.id === expense.id ? { 
        ...e, 
        status: newStatus, 
        adminComments: commentToSave || undefined 
      } : e));
      
      // Update selected expense modal
      if (selectedExpense?.id === expense.id) {
        setSelectedExpense(prev => prev ? { 
          ...prev, 
          status: newStatus, 
          adminComments: commentToSave || undefined 
        } : null);
      }
      
      setAdminComment("");
      showToast("success", `✓ Status updated to '${newStatus.replace('_', ' ').toUpperCase()}' successfully for voucher ${expense.voucherNumber || expense.title}.`);
    } catch (err) {
      console.error(err);
      showToast("error", `Failed to update status: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setAdminActionLoading(false);
      setActiveActionStatus(null);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    setAdminActionLoading(true);
    try {
      for (const id of selectedIds) {
        const exp = expenses.find(e => e.id === id);
        if (exp && (exp.status === "pending" || exp.status === "under_review")) {
          await updateExpense(id, {
            status: "approved",
            adminComments: "Bulk approved."
          }, user.employeeId, user.name);

          await createNotification(
            exp.employeeId,
            "Expense Claim APPROVED",
            `Your claim for "${exp.title}" was approved during a bulk administrative operation.`
          );
        }
      }

      setExpenses(prev => prev.map(e => selectedIds.includes(e.id) ? { 
        ...e, 
        status: "approved" as const, 
        adminComments: "Bulk approved." 
      } : e));
      
      setSelectedIds([]);
    } catch (err) {
      console.error("Bulk approval error:", err);
    } finally {
      setAdminActionLoading(false);
    }
  };

  const handleDelete = (expense: Expense) => {
    setDeletingExpense(expense);
  };

  const confirmDelete = async () => {
    if (!deletingExpense) return;
    const targetTitle = deletingExpense.title;
    const targetVoucher = deletingExpense.voucherNumber || "Voucher";
    try {
      await deleteExpense(deletingExpense.id, user.employeeId, user.name);
      setExpenses(prev => prev.filter(e => e.id !== deletingExpense.id));
      if (selectedExpense?.id === deletingExpense.id) {
        setSelectedExpense(null);
      }
      setDeletingExpense(null);
      showToast("success", `✓ Expense claim "${targetTitle}" (${targetVoucher}) permanently deleted.`);
    } catch (err) {
      console.error(err);
      showToast("error", `Failed to delete expense claim: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  // Helper to load file from Firestore chunks and preview
  const handlePreviewBill = async (bill: BillFile) => {
    if (!selectedExpense) return;
    if (bill.fileData) {
      setPreviewingBill(bill);
      return;
    }
    
    setLoadingBillId(bill.id);
    try {
      const fullData = await getBillData(selectedExpense.id, bill.id);
      setPreviewingBill({
        ...bill,
        fileData: fullData
      });
    } catch (err) {
      console.error("Failed to load receipt data for preview:", err);
    } finally {
      setLoadingBillId(null);
    }
  };

  // Helper to load file from Firestore chunks and download
  const handleDownloadBill = async (bill: BillFile) => {
    if (!selectedExpense) return;
    let data = bill.fileData;
    if (!data) {
      setLoadingBillId(bill.id);
      try {
        data = await getBillData(selectedExpense.id, bill.id);
      } catch (err) {
        console.error("Failed to load receipt data for download:", err);
        setLoadingBillId(null);
        return;
      }
      setLoadingBillId(null);
    }
    
    const link = document.createElement("a");
    link.href = data;
    link.download = bill.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [singleDocLoading, setSingleDocLoading] = useState(false);

  const handleExportSingleExpenseDocx = async (expense: Expense) => {
    if (!expense.bills || expense.bills.length === 0) return;
    setSingleDocLoading(true);
    try {
      const items = await collectBillItems([expense]);
      await exportBillsToWordDocx(items, expense.employeeName, 12);
    } catch (err) {
      console.error(err);
      alert("Failed to export Word document.");
    } finally {
      setSingleDocLoading(false);
    }
  };

  const handleExportSingleExpensePdf = async (expense: Expense) => {
    if (!expense.bills || expense.bills.length === 0) return;
    setSingleDocLoading(true);
    try {
      const items = await collectBillItems([expense]);
      await exportBillsToPDF(items, expense.employeeName, 12);
    } catch (err) {
      console.error(err);
      alert("Failed to export PDF document.");
    } finally {
      setSingleDocLoading(false);
    }
  };

  // Helper to trigger file download from Base64
  const triggerDownload = (bill: BillFile) => {
    const link = document.createElement("a");
    link.href = bill.fileData;
    link.download = bill.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Status Badge Helper
  const getStatusBadge = (status: Expense["status"]) => {
    switch (status) {
      case "pending":
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-100">🟡 Pending</span>;
      case "under_review":
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-50 text-sky-700 text-xs font-semibold rounded-full border border-sky-100">🔵 Under Review</span>;
      case "approved":
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-100 font-sans">🟢 Approved</span>;
      case "rejected":
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 text-xs font-semibold rounded-full border border-rose-100 font-sans">🔴 Rejected</span>;
      case "reimbursed":
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-full border border-purple-100 font-sans">🟣 Reimbursed</span>;
    }
  };

  // Filtering Logic
  const filteredExpenses = expenses.filter(exp => {
    // Search Queries
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      const matchTitle = exp.title.toLowerCase().includes(query);
      const matchVendor = exp.vendor.toLowerCase().includes(query);
      const matchEmp = exp.employeeName.toLowerCase().includes(query);
      if (!matchTitle && !matchVendor && !matchEmp) return false;
    }

    // Role Specific Filter
    if (user.role === "admin" && filterEmployee) {
      if ((exp.employeeName || "").trim().toLowerCase() !== filterEmployee.toLowerCase()) return false;
    }

    // Category
    if (filterCategory && exp.category !== filterCategory) return false;

    // Status
    if (filterStatus && exp.status !== filterStatus) return false;

    // Monthly Grouping Filter
    if (filterMonth || filterYear) {
      const expDate = new Date(exp.date);
      const expMonth = expDate.toLocaleString("default", { month: "long" });
      const expYear = expDate.getFullYear().toString();

      if (filterMonth && expMonth !== filterMonth) return false;
      if (filterYear && expYear !== filterYear) return false;
    }

    return true;
  });

  // Get distinct months & years for dropdowns
  const monthsList = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const yearsList = ["2024", "2025", "2026", "2027"];

  // Unique employees list for Admin filter
  const uniqueEmployees = (() => {
    const map = new Map<string, string>();
    expenses.forEach(e => {
      if (e.employeeName) {
        const name = e.employeeName.trim();
        const lowerName = name.toLowerCase();
        if (!map.has(lowerName)) {
          map.set(lowerName, name);
        }
      } else if (e.employeeId) {
        const id = e.employeeId.trim();
        const lowerId = id.toLowerCase();
        if (!map.has(lowerId)) {
          map.set(lowerId, id);
        }
      }
    });
    return Array.from(map.entries()).map(([loweredName, name]) => {
      return {
        id: loweredName,
        name
      };
    });
  })();

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    const pendings = filteredExpenses.filter(e => e.status === "pending" || e.status === "under_review").map(e => e.id);
    if (selectedIds.length === pendings.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendings);
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

  const handleExportExcel = () => {
    if (filteredExpenses.length === 0) return;

    const headers = [
      "voucher bills",
      "Date",
      "Paid by",
      "Paid to",
      "Payment Method",
      "Amount",
      "Approval",
      "Type of Expense",
      "Method of Payment",
      "SW Payment Status"
    ];

    const rows = filteredExpenses.map((exp, idx) => {
      const voucherNum = exp.voucherNumber || `SW-${(idx + 1).toString().padStart(3, '0')}`;
      const formattedDate = formatDateForExcel(exp.date);
      const paidBy = exp.employeeName || "";
      const paidTo = exp.vendor || exp.title || "";
      const paymentMethod = exp.paymentMethod || "UPI";
      const amount = exp.totalAmount || exp.amount || 0;
      
      let approval = "Pending";
      if (exp.status === "approved" || exp.status === "reimbursed") {
        approval = "Approved";
      } else if (exp.status === "rejected") {
        approval = "Rejected";
      }

      const typeOfExpense = exp.title || exp.category || "";
      const methodOfPayment = (paymentMethod === "Bank Transfer" || paymentMethod === "Credit Card")
        ? "SW Payment"
        : "Personal Payment";
      const swPaymentStatus = exp.status === "reimbursed" ? "Paid" : exp.status === "approved" ? "Approved" : "";

      return [
        `"${voucherNum.replace(/"/g, '""')}"`,
        `"${formattedDate}"`,
        `"${paidBy.replace(/"/g, '""')}"`,
        `"${paidTo.replace(/"/g, '""')}"`,
        `"${paymentMethod.replace(/"/g, '""')}"`,
        amount,
        `"${approval}"`,
        `"${typeOfExpense.replace(/"/g, '""')}"`,
        `"${methodOfPayment}"`,
        `"${swPaymentStatus}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Voucher_Bills_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="expense-list-container" className="py-6 px-4 max-w-7xl mx-auto space-y-6 relative">
      {/* Floating Toast Notification Banner */}
      <AnimatePresence>
        {toast && (
          <motion.div
            id="action-toast-banner"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-5 right-5 z-[120] max-w-md px-5 py-3.5 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-md ${
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 font-sans">
            {user.role === "admin" ? "Employee Expense Claim Hub" : "My Submitted Expense Claims"}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Filter, audit, view receipts, and update claim statuses.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button
            id="queue-download-excel-btn"
            onClick={handleExportExcel}
            disabled={filteredExpenses.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Download Excel Voucher Bills
          </button>

          <button
            id="refresh-expense-list"
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
            Refresh Registry
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <div id="filters-panel" className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-50 pb-3 mb-2">
          <Filter className="h-4 w-4 text-indigo-600" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Search & Filters</span>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${user.role === "admin" ? "md:grid-cols-3" : "md:grid-cols-2"} gap-4`}>
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              id="filter-search-query"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, vendor, invoice..."
              className="pl-9 pr-3.5 py-2 w-full border border-slate-200 rounded-xl text-slate-900 bg-slate-50 text-xs focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none transition"
            />
          </div>

          {/* Employee Filter (Admin Only) */}
          {user.role === "admin" && (
            <select
              id="filter-employee-select"
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              className="px-3 py-2 w-full border border-slate-200 rounded-xl text-slate-900 bg-slate-50 text-xs focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none transition"
            >
              <option value="">All Employees</option>
              {uniqueEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <select
            id="filter-status-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 w-full border border-slate-200 rounded-xl text-slate-900 bg-slate-50 text-xs focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none transition"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="reimbursed">Reimbursed</option>
          </select>
        </div>

        {/* Advanced Month Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Year Filter */}
          <select
            id="filter-year-select"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="px-3 py-2 w-full border border-slate-200 rounded-xl text-slate-900 bg-slate-50 text-xs focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none transition"
          >
            <option value="">All Years</option>
            {yearsList.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Month Filter */}
          <select
            id="filter-month-select"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 w-full border border-slate-200 rounded-xl text-slate-900 bg-slate-50 text-xs focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none transition"
          >
            <option value="">All Months</option>
            {monthsList.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk actions (Admin only) */}
      {user.role === "admin" && selectedIds.length > 0 && (
        <div id="bulk-actions-panel" className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 bg-indigo-600 rounded-full animate-ping" />
            <span className="text-xs font-bold text-indigo-900">
              {selectedIds.length} items selected for bulk approval
            </span>
          </div>

          <button
            id="bulk-approve-selected-btn"
            onClick={handleBulkApprove}
            disabled={adminActionLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            Bulk Approve Claimed
          </button>
        </div>
      )}

      {/* Main Table Container */}
      <div id="claims-table-wrapper" className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600 mx-auto mb-2" />
            Retrieving registry archives...
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm flex flex-col items-center justify-center">
            <FolderMinus className="h-10 w-10 text-slate-300 mb-2" />
            No matching expense claims found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                  {user.role === "admin" && (
                    <th className="py-4 pl-6 w-12 text-center">
                      <input
                        id="select-all-claims-checkbox"
                        type="checkbox"
                        checked={selectedIds.length > 0 && selectedIds.length === filteredExpenses.filter(e => e.status === "pending" || e.status === "under_review").length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="py-4 px-4 font-sans">Date</th>
                  <th className="py-4 px-4 font-sans">Voucher No.</th>
                  {user.role === "admin" && <th className="py-4 px-4 font-sans">Employee</th>}
                  <th className="py-4 px-4 font-sans">Type of Expense</th>
                  <th className="py-4 px-4 font-sans">Vendor</th>
                  <th className="py-4 px-4 font-sans">Payment Method</th>
                  <th className="py-4 px-4 text-right font-sans">Total Claim</th>
                  <th className="py-4 px-4 text-center font-sans">Status</th>
                  <th className="py-4 px-6 text-center font-sans">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredExpenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-slate-50/50 transition">
                    {user.role === "admin" && (
                      <td className="py-3.5 pl-6 text-center">
                        {(exp.status === "pending" || exp.status === "under_review") ? (
                          <input
                            id={`select-claim-${exp.id}`}
                            type="checkbox"
                            checked={selectedIds.includes(exp.id)}
                            onChange={() => toggleSelect(exp.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        ) : (
                          <div className="w-4 h-4 mx-auto bg-slate-100 rounded-full flex items-center justify-center text-slate-400 text-[9px] font-bold">
                            ✓
                          </div>
                        )}
                      </td>
                    )}
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-600 whitespace-nowrap">
                      {exp.date}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 whitespace-nowrap">
                      {exp.voucherNumber || "—"}
                    </td>
                    {user.role === "admin" && (
                      <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        {exp.employeeName}
                      </td>
                    )}
                    <td className="py-3.5 px-4 font-bold text-slate-800 max-w-xs truncate">
                      {exp.description || exp.title}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-500 whitespace-nowrap">
                      {exp.vendor}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-200 uppercase font-mono tracking-wider">
                        {exp.paymentMethod || "UPI"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap font-mono">
                      ₹{exp.totalAmount.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {getStatusBadge(exp.status)}
                    </td>
                    <td className="py-3.5 px-6 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          id={`view-claim-details-${exp.id}`}
                          onClick={() => {
                            setSelectedExpense(exp);
                            markExpenseAsViewed(exp.id, exp.voucherNumber);
                          }}
                          className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-lg border border-slate-100 bg-white transition shadow-sm cursor-pointer relative"
                          title="View Details & Remarks"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {getUnreadCommentsCount(exp) > 0 && (
                            <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center animate-pulse">
                              {getUnreadCommentsCount(exp)}
                            </span>
                          )}
                        </button>
                        
                        {(user.role === "admin" || exp.employeeId === user.employeeId) && (
                          <button
                            id={`delete-claim-btn-${exp.id}`}
                            onClick={() => handleDelete(exp)}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg border border-slate-100 bg-white transition shadow-sm cursor-pointer"
                            title="Delete Claim"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}

                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed Modal */}
      <AnimatePresence>
        {selectedExpense && (
          <>
            <div id="claim-modal-backdrop" className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setSelectedExpense(null)} />
            <motion.div
              id="claim-modal-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 top-4 bottom-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-3xl md:max-h-[90vh] md:h-auto bg-white border border-slate-100 rounded-3xl shadow-2xl z-[70] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-sans">Expense Claim Specification</h3>
                    <p className="text-[10px] text-slate-400 font-mono">
                      VOUCHER NO: {selectedExpense.voucherNumber || "N/A"}
                    </p>
                  </div>
                </div>
                <button
                  id="close-claim-modal-btn"
                  onClick={() => setSelectedExpense(null)}
                  className="p-1.5 hover:bg-slate-150 text-slate-400 hover:text-slate-600 rounded-xl border border-slate-100 bg-white transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Specification Grid */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="block text-[9px] uppercase tracking-wider font-bold text-slate-400">Employee Name</span>
                    <span className="block text-xs font-bold text-slate-800 mt-1">{selectedExpense.employeeName}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="block text-[9px] uppercase tracking-wider font-bold text-slate-400">Voucher No.</span>
                    <span className="block text-xs font-bold text-indigo-600 mt-1 font-mono">{selectedExpense.voucherNumber || "—"}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="block text-[9px] uppercase tracking-wider font-bold text-slate-400">Date</span>
                    <span className="block text-xs font-bold text-slate-800 mt-1 font-mono">{selectedExpense.date}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="block text-[9px] uppercase tracking-wider font-bold text-slate-400">Status</span>
                    <div className="mt-1">{getStatusBadge(selectedExpense.status)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-100 p-4 rounded-xl space-y-2.5">
                    <h4 className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">Financial breakdown</h4>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-500">
                        <span>Base Amount:</span>
                        <span className="font-mono">₹{selectedExpense.amount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>GST/Tax Amount:</span>
                        <span className="font-mono">₹{(selectedExpense.gstAmount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-slate-900 text-sm">
                        <span>Total Claimed:</span>
                        <span className="font-mono">₹{selectedExpense.totalAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-100 p-4 rounded-xl space-y-2.5">
                    <h4 className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">Operational details</h4>
                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div><span className="font-semibold text-slate-400">Vendor:</span> {selectedExpense.vendor}</div>
                      <div><span className="font-semibold text-slate-400">Payment:</span> {selectedExpense.paymentMethod}</div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedExpense.description && (
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs leading-relaxed text-slate-600">
                    <span className="block font-bold text-slate-700 mb-1">Type of Expense:</span>
                    {selectedExpense.description}
                  </div>
                )}

                {/* Receipt files */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700">Digital Receipts ({selectedExpense.bills.length})</h4>
                    {selectedExpense.bills.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleExportSingleExpenseDocx(selectedExpense)}
                          disabled={singleDocLoading}
                          className="px-2.5 py-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition cursor-pointer flex items-center gap-1"
                        >
                          <Download className="h-3 w-3" /> Word (.docx)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportSingleExpensePdf(selectedExpense)}
                          disabled={singleDocLoading}
                          className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition cursor-pointer flex items-center gap-1"
                        >
                          <Download className="h-3 w-3" /> PDF (.pdf)
                        </button>
                      </div>
                    )}
                  </div>
                  {selectedExpense.bills.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No files or invoices uploaded for this expense claim.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedExpense.bills.map(bill => (
                        <div key={bill.id} className="border border-slate-100 rounded-xl p-3 bg-white flex items-center justify-between gap-3 shadow-sm">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100 flex-shrink-0">
                              <FileText className="h-5 w-5 text-indigo-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-700 truncate">{bill.fileName}</p>
                              <p className="text-[10px] text-slate-400 font-mono uppercase">{bill.fileType.split("/")[1] || "File"}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button
                              id={`preview-receipt-bill-${bill.id}`}
                              onClick={() => handlePreviewBill(bill)}
                              disabled={loadingBillId !== null}
                              className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg border border-indigo-100 transition cursor-pointer disabled:opacity-50"
                              title="Preview Receipt"
                            >
                              {loadingBillId === bill.id ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              id={`download-receipt-bill-${bill.id}`}
                              onClick={() => handleDownloadBill(bill)}
                              disabled={loadingBillId !== null}
                              className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 transition cursor-pointer disabled:opacity-50"
                              title="Download Receipt File"
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

                {/* Voucher Remarks & Clarification Discussion Thread */}
                <div id="voucher-remarks-thread" className="border-t border-slate-100 pt-6 space-y-4">
                  {(() => {
                    const activeFilterMonth = filterMonth || new Date().toLocaleString("default", { month: "long" });
                    const activeFilterYear = filterYear || new Date().getFullYear().toString();
                    const currentMonthComments = (selectedExpense.comments || []).filter(cmt => {
                      if (!cmt.timestamp) return true;
                      const cmtDate = new Date(cmt.timestamp);
                      const cmtMonth = cmtDate.toLocaleString("default", { month: "long" });
                      const cmtYear = cmtDate.getFullYear().toString();
                      if (activeFilterMonth && activeFilterMonth !== "All" && activeFilterMonth !== "") {
                        return cmtMonth === activeFilterMonth && (!activeFilterYear || activeFilterYear === "All" || activeFilterYear === "" || cmtYear === activeFilterYear);
                      }
                      return true;
                    });

                    return (
                      <>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-indigo-600" />
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                              Voucher Remarks ({currentMonthComments.length})
                            </h4>
                          </div>
                          <div className="flex items-center gap-3">
                            {currentMonthComments.length > 0 && (
                              <button
                                type="button"
                                onClick={handleClearMonthlyRemarks}
                                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer transition"
                                title="Delete all remarks for this month"
                              >
                                <Trash2 className="h-3 w-3" /> Clear Monthly Remarks
                              </button>
                            )}
                            <span className="text-[10px] text-slate-400 font-medium">
                              {user.role === "admin" ? "Write remarks or point out issues" : "Reply to remarks or clarify doubts"}
                            </span>
                          </div>
                        </div>

                        {/* Remarks list */}
                        {currentMonthComments.length === 0 ? (
                          <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400">
                            No comments or remarks posted for {activeFilterMonth && activeFilterMonth !== "All" ? activeFilterMonth : "this month"} yet.
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                            {currentMonthComments.map(cmt => (
                              <div 
                                key={cmt.id} 
                                className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/80 text-slate-900 text-xs space-y-1.5"
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
                                        onClick={() => handleDeleteRemark(cmt.id)}
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

                  {/* Input Box for Remark / Clarification */}
                  <div className="space-y-2 pt-1">
                    <textarea
                      id="voucher-remark-text-box"
                      value={newRemarkText}
                      onChange={(e) => setNewRemarkText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (!postingRemark && newRemarkText.trim()) {
                            handleSendRemark();
                          }
                        }
                      }}
                      placeholder={
                        user.role === "admin" 
                          ? "Write a comment or point out doubts about this bill... (Press Enter to send)" 
                          : "Type a response or clarify doubts for the admin... (Press Enter to send)"
                      }
                      rows={2}
                      className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 text-xs outline-none transition resize-none shadow-xs"
                    />
                    <div className="flex justify-end">
                      <button
                        id="send-voucher-remark-btn"
                        type="button"
                        onClick={handleSendRemark}
                        disabled={postingRemark || !newRemarkText.trim()}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                      >
                        {postingRemark ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Send
                      </button>
                    </div>
                  </div>
                </div>

                {/* Previous Admin Comments */}
                {selectedExpense.adminComments && (
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex gap-3 text-xs">
                    <Info className="h-4 w-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="block font-bold text-indigo-900">Administrative Decision Comment:</span>
                      <p className="text-indigo-800 mt-0.5 font-medium">{selectedExpense.adminComments}</p>
                    </div>
                  </div>
                )}

                {/* Audit Logs */}
                <div className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                  <span>Created Date:</span>
                  <span>{new Date(selectedExpense.createdDate).toLocaleString()}</span>
                </div>
              </div>

              {/* Admin Action Panel */}
              {user.role === "admin" && (
                <div id="admin-specification-actions" className="p-6 bg-slate-50 border-t border-slate-100 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Admin Control Actions</span>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      id="admin-reject-claim"
                      onClick={() => handleStatusChange(selectedExpense, "rejected")}
                      disabled={adminActionLoading}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-xs font-semibold text-white rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      {activeActionStatus === "rejected" && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                      Reject Claim
                    </button>
                    <button
                      id="admin-under-review-claim"
                      onClick={() => handleStatusChange(selectedExpense, "under_review")}
                      disabled={adminActionLoading}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-xs font-semibold text-white rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      {activeActionStatus === "under_review" && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                      Set Under Review
                    </button>
                    <button
                      id="admin-approve-claim"
                      onClick={() => handleStatusChange(selectedExpense, "approved")}
                      disabled={adminActionLoading}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-xs font-semibold text-white rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      {activeActionStatus === "approved" && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                      Approve Claim
                    </button>
                    <button
                      id="admin-reimburse-claim"
                      onClick={() => handleStatusChange(selectedExpense, "reimbursed")}
                      disabled={adminActionLoading}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-xs font-semibold text-white rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      {activeActionStatus === "reimbursed" && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                      Mark Reimbursed
                    </button>
                  </div>
                </div>
              )}

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Receipt File Preview Overlay */}
      <AnimatePresence>
        {previewingBill && (
          <>
            <div 
              id="list-receipt-preview-backdrop" 
              className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm z-[80] flex items-center justify-center p-4" 
              onClick={() => setPreviewingBill(null)} 
            />
            <motion.div
              id="list-receipt-preview-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 top-10 bottom-10 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:h-[650px] bg-white border border-slate-100 rounded-3xl shadow-2xl z-[90] overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-700 truncate max-w-xs md:max-w-md">{previewingBill.fileName}</span>
                </div>
                <button
                  id="close-list-receipt-preview-btn"
                  type="button"
                  onClick={() => setPreviewingBill(null)}
                  className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div 
                className="flex-1 bg-slate-100 p-4 flex items-center justify-center overflow-hidden relative"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
              >
                {previewingBill.fileType.includes("pdf") ? (
                  <iframe
                    src={previewingBill.fileData}
                    className="w-full h-full border-0 rounded-xl bg-white"
                    title="PDF Receipt Preview"
                  />
                ) : (
                  <>
                    <div className="w-full h-full flex items-center justify-center overflow-hidden select-none">
                      <img
                        src={previewingBill.fileData}
                        alt={previewingBill.fileName}
                        referrerPolicy="no-referrer"
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        className={`max-w-full max-h-full object-contain rounded-xl shadow-md transition-transform duration-75 ease-out select-none ${zoomScale > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        style={{
                          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`
                        }}
                      />
                    </div>

                    {/* Floating Zoom Controls specifically for this image viewport */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-lg z-10 select-none">
                      <button 
                        type="button"
                        onClick={handleZoomOut} 
                        className="p-1 hover:bg-slate-200/80 text-slate-600 rounded-lg transition cursor-pointer"
                        title="Zoom Out"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </button>
                      <span className="text-[10px] font-bold font-mono text-slate-500 min-w-[2.5rem] text-center">
                        {Math.round(zoomScale * 100)}%
                      </span>
                      <button 
                        type="button"
                        onClick={handleZoomIn} 
                        className="p-1 hover:bg-slate-200/80 text-slate-600 rounded-lg transition cursor-pointer"
                        title="Zoom In"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                      <div className="w-[1px] h-4 bg-slate-200" />
                      <button 
                        type="button"
                        onClick={handleZoomReset} 
                        className="p-1 hover:bg-slate-200/80 text-slate-600 rounded-lg transition cursor-pointer"
                        title="Reset View"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Custom Delete Confirmation Dialog */}
      <AnimatePresence>
        {deletingExpense && (
          <>
            <div 
              id="delete-confirm-backdrop" 
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4" 
              onClick={() => setDeletingExpense(null)} 
            />
            <motion.div
              id="delete-confirm-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-slate-100 rounded-3xl shadow-2xl z-[110] overflow-hidden p-6"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl flex-shrink-0">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900 font-sans">Delete Expense Claim?</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Are you sure you want to delete this pending expense claim for <span className="font-bold">"{deletingExpense.title}"</span>? This action is permanent and cannot be undone.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  id="cancel-delete-claim-btn"
                  type="button"
                  onClick={() => setDeletingExpense(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="confirm-delete-claim-btn"
                  type="button"
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white rounded-xl transition shadow-md cursor-pointer"
                >
                  Delete Permanently
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
