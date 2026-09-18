import { useState, useEffect } from "react";
import { 
  type EmployeeProfile, 
  type AdvancePayment, 
  type Expense,
  subscribeToAdvances,
  subscribeToExpenses,
  getEmployees,
  createAdvancePayment,
  cancelAdvancePayment,
  calculateAdvanceSummary,
  isAdvancePaymentMethod
} from "../lib/firebase";
import { 
  Wallet, 
  PlusCircle, 
  ArrowUpRight,
  ArrowDownLeft,
  Clock, 
  CheckCircle2, 
  Search, 
  X, 
  RefreshCw, 
  AlertCircle,
  Building2,
  History,
  Receipt
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AdvanceManagementProps {
  user: EmployeeProfile;
  refreshTrigger?: number;
  onNavigateToSubmit?: () => void;
}

export default function AdvanceManagement({ user, refreshTrigger, onNavigateToSubmit }: AdvanceManagementProps) {
  const [advances, setAdvances] = useState<AdvancePayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [, setLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");

  // Admin Modal States
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [, setSelectedEmployeeForPay] = useState<EmployeeProfile | null>(null);
  const [statementEmployee, setStatementEmployee] = useState<EmployeeProfile | null>(null);

  // Pay Advance Form Fields (Staff ID is NOT required or displayed)
  const [formEmployeeEmail, setFormEmployeeEmail] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formPaymentDate, setFormPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [formPaymentMethod, setFormPaymentMethod] = useState("Bank Transfer");
  const [formPurpose, setFormPurpose] = useState("");
  const [formReferenceNumber, setFormReferenceNumber] = useState("");
  const [submittingPay, setSubmittingPay] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Toast / feedback message
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Real-time subscriptions
  useEffect(() => {
    setLoading(true);
    const unsubAdvances = subscribeToAdvances((list) => {
      setAdvances(list);
      setLoading(false);
    });

    const unsubExpenses = subscribeToExpenses((list) => {
      setExpenses(list);
    });

    // Load registered employees for Admin dropdown & table
    if (user.role === "admin") {
      getEmployees().then(setEmployees).catch(console.error);
    }

    return () => {
      unsubAdvances();
      unsubExpenses();
    };
  }, [user.role, refreshTrigger]);

  // Open Pay Modal pre-filled
  const openPayModalForEmployee = (emp?: EmployeeProfile) => {
    if (emp) {
      setSelectedEmployeeForPay(emp);
      setFormEmployeeEmail(emp.email);
    } else {
      setSelectedEmployeeForPay(null);
      setFormEmployeeEmail(employees[0]?.email || "");
    }
    setFormAmount("");
    setFormPaymentDate(new Date().toISOString().split("T")[0]);
    setFormPaymentMethod("Bank Transfer");
    setFormPurpose("");
    setFormReferenceNumber("");
    setActionMessage(null);
    setIsPayModalOpen(true);
  };

  // Submit Advance Payment
  const handlePayAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage(null);

    const targetEmp = employees.find(emp => emp.email.toLowerCase() === formEmployeeEmail.toLowerCase());
    if (!targetEmp) {
      setActionMessage({ type: "error", text: "Please select a valid employee." });
      return;
    }

    const parsedAmount = parseFloat(formAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setActionMessage({ type: "error", text: "Please enter a valid advance amount greater than ₹0." });
      return;
    }

    if (!formPurpose.trim()) {
      setActionMessage({ type: "error", text: "Please enter the purpose or description for this advance." });
      return;
    }

    setSubmittingPay(true);
    try {
      await createAdvancePayment({
        employeeId: targetEmp.employeeId,
        employeeName: targetEmp.name,
        employeeEmail: targetEmp.email,
        amount: parsedAmount,
        paymentDate: formPaymentDate,
        paymentMethod: formPaymentMethod,
        purpose: formPurpose.trim(),
        referenceNumber: formReferenceNumber.trim() || "",
        createdBy: user.employeeId,
        createdByName: user.name
      });

      showToast("success", `Successfully credited ₹${parsedAmount.toLocaleString("en-IN")} advance to ${targetEmp.name}!`);
      setIsPayModalOpen(false);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to disburse advance payment." });
    } finally {
      setSubmittingPay(false);
    }
  };

  // Cancel / Reverse Advance Payment
  const handleCancelAdvance = async (advance: AdvancePayment) => {
    if (!window.confirm(`Are you sure you want to cancel the advance of ₹${advance.amount} for ${advance.employeeName}? This will reverse the advance credit and recalculate their balance.`)) {
      return;
    }

    try {
      await cancelAdvancePayment(advance.id, user.employeeId, user.name, "Cancelled by Admin");
      showToast("success", `Advance payment of ₹${advance.amount} has been cancelled.`);
    } catch (err: any) {
      showToast("error", err.message || "Failed to cancel advance payment.");
    }
  };

  // Employee's own stats
  const employeeSummary = calculateAdvanceSummary(
    user.employeeId,
    advances,
    expenses,
    user.email,
    user.name
  );

  // Employee's own lists
  const myAdvances = advances.filter(a => 
    (a.employeeEmail && a.employeeEmail.toLowerCase() === user.email.toLowerCase()) ||
    (a.employeeId && a.employeeId.toLowerCase() === user.employeeId.toLowerCase()) ||
    (a.employeeName && a.employeeName.toLowerCase() === user.name.toLowerCase())
  );

  const myAdvanceExpenses = expenses.filter(e => 
    isAdvancePaymentMethod(e.paymentMethod, e.paymentSource) &&
    ((e.employeeEmail && e.employeeEmail.toLowerCase() === user.email.toLowerCase()) ||
     (e.employeeId && e.employeeId.toLowerCase() === user.employeeId.toLowerCase()) ||
     (e.employeeName && e.employeeName.toLowerCase() === user.name.toLowerCase()))
  );

  // Admin: Calculate summary for every employee (Identified strictly by Name and Email - NO Staff ID)
  const employeeTableRows = employees.map(emp => {
    const summary = calculateAdvanceSummary(emp.employeeId, advances, expenses, emp.email, emp.name);
    return {
      profile: emp,
      ...summary
    };
  }).filter(row => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return row.profile.name.toLowerCase().includes(q) || row.profile.email.toLowerCase().includes(q);
  });

  // Admin company-wide aggregate metrics
  const totalCompanyAdvance = advances
    .filter(a => a.status !== "cancelled")
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const totalCompanyUsed = expenses
    .filter(e => isAdvancePaymentMethod(e.paymentMethod, e.paymentSource) && (e.status === "approved" || e.status === "reimbursed"))
    .reduce((sum, e) => sum + (Number(e.totalAmount || e.amount) || 0), 0);

  const totalCompanyOutstandingBalance = Math.max(0, totalCompanyAdvance - totalCompanyUsed);

  // ─── Per-Advance Bucket Types ───────────────────────────────────────────────
  type BucketExpenseRow = {
    expense: Expense;
    date: string;
    title: string;
    details: string;
    amount: number;
    status: string;
    runningBalanceInBucket: number; // countdown balance within this advance bucket
  };

  type AdvanceBucket = {
    advance: AdvancePayment;
    advanceIndex: number;          // 1-based display index
    advanceAmount: number;
    spentInBucket: number;         // total of approved expenses assigned to bucket
    remainingInBucket: number;     // advanceAmount - spentInBucket
    isFullyUsed: boolean;
    isCancelled: boolean;
    rows: BucketExpenseRow[];
  };

  /**
   * Assigns advance expenses to advance buckets sequentially:
   * - Approved/reimbursed expenses consume the current bucket's remaining balance.
   * - When a bucket's remaining hits 0, the next bucket becomes current.
   * - Pending/rejected expenses are also shown in the current bucket for context
   *   but only approved ones count against the balance.
   */
  const buildAdvanceBuckets = (targetEmp: EmployeeProfile): AdvanceBucket[] => {
    // 1. Collect advances for this employee (all statuses so we can show cancelled too)
    const empAdvances = advances
      .filter(a =>
        (a.employeeEmail && a.employeeEmail.toLowerCase() === targetEmp.email.toLowerCase()) ||
        (a.employeeId && a.employeeId.toLowerCase() === targetEmp.employeeId.toLowerCase()) ||
        (a.employeeName && a.employeeName.toLowerCase() === targetEmp.name.toLowerCase())
      )
      .sort((a, b) => {
        const da = a.paymentDate || a.createdAt?.split("T")[0] || "";
        const db = b.paymentDate || b.createdAt?.split("T")[0] || "";
        return da.localeCompare(db);
      });

    if (empAdvances.length === 0) return [];

    // 2. Collect advance-funded expenses, chronological
    const empAdvanceExpenses = expenses
      .filter(e =>
        isAdvancePaymentMethod(e.paymentMethod, e.paymentSource) &&
        ((e.employeeEmail && e.employeeEmail.toLowerCase() === targetEmp.email.toLowerCase()) ||
         (e.employeeId && e.employeeId.toLowerCase() === targetEmp.employeeId.toLowerCase()) ||
         (e.employeeName && e.employeeName.toLowerCase() === targetEmp.name.toLowerCase()))
      )
      .sort((a, b) => {
        const da = a.date || a.createdDate?.split("T")[0] || "";
        const db = b.date || b.createdDate?.split("T")[0] || "";
        return da.localeCompare(db);
      });

    // 3. Build empty buckets for every advance
    const buckets: AdvanceBucket[] = empAdvances.map((adv, idx) => ({
      advance: adv,
      advanceIndex: idx + 1,
      advanceAmount: Number(adv.amount) || 0,
      spentInBucket: 0,
      remainingInBucket: Number(adv.amount) || 0,
      isFullyUsed: false,
      isCancelled: adv.status === "cancelled",
      rows: []
    }));

    // 4. Walk expenses and assign to buckets sequentially
    //    Only approved/reimbursed expenses consume the balance.
    let bucketIdx = 0;

    // Skip any leading cancelled buckets
    while (bucketIdx < buckets.length && buckets[bucketIdx].isCancelled) bucketIdx++;

    for (const exp of empAdvanceExpenses) {
      const amt = Number(exp.totalAmount || exp.amount) || 0;
      const isApproved = exp.status === "approved" || exp.status === "reimbursed";

      // If approved, advance the bucket pointer as needed
      if (isApproved && bucketIdx < buckets.length) {
        // Advance to next non-cancelled bucket if current is fully used
        while (
          bucketIdx < buckets.length &&
          (buckets[bucketIdx].isCancelled || buckets[bucketIdx].remainingInBucket <= 0)
        ) {
          if (!buckets[bucketIdx].isCancelled && buckets[bucketIdx].remainingInBucket <= 0) {
            buckets[bucketIdx].isFullyUsed = true;
          }
          bucketIdx++;
        }
      }

      if (bucketIdx >= buckets.length) {
        // All buckets exhausted — attach to the last non-cancelled bucket for display
        const lastIdx = buckets.map(b => b.isCancelled).lastIndexOf(false);
        if (lastIdx !== -1) {
          const b = buckets[lastIdx];
          if (isApproved) b.spentInBucket += amt;
          const runBal = Math.max(0, b.advanceAmount - b.spentInBucket);
          b.rows.push({
            expense: exp,
            date: exp.date || exp.createdDate?.split("T")[0] || "",
            title: `Expense: ${exp.title}`,
            details: `Voucher: ${exp.voucherNumber || "Pending"} · Paid to: ${exp.vendor || "N/A"}`,
            amount: amt,
            status: exp.status,
            runningBalanceInBucket: runBal
          });
        }
        continue;
      }

      const bucket = buckets[bucketIdx];
      if (isApproved) {
        bucket.spentInBucket += amt;
        bucket.remainingInBucket = Math.max(0, bucket.advanceAmount - bucket.spentInBucket);
      }

      bucket.rows.push({
        expense: exp,
        date: exp.date || exp.createdDate?.split("T")[0] || "",
        title: `Expense: ${exp.title}`,
        details: `Voucher: ${exp.voucherNumber || "Pending"} · Paid to: ${exp.vendor || "N/A"}`,
        amount: amt,
        status: exp.status,
        runningBalanceInBucket: bucket.remainingInBucket
      });
    }

    // 5. Mark fully-used buckets
    for (const b of buckets) {
      if (!b.isCancelled && b.remainingInBucket <= 0 && b.spentInBucket >= b.advanceAmount) {
        b.isFullyUsed = true;
      }
    }

    return buckets;
  };

  return (
    <div id="advance-management-container" className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold flex items-center gap-2 ${
              toast.type === "success" 
                ? "bg-emerald-950 text-emerald-200 border-emerald-800" 
                : "bg-rose-950 text-rose-200 border-rose-800"
            }`}
          >
            {toast.type === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-rose-400" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold tracking-wider uppercase border border-indigo-500/30">
              <Wallet className="h-3.5 w-3.5" />
              <span>{user.role === "admin" ? "Corporate Advance Pool" : "Employee Advance Wallet"}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Advance & Expense Management
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm max-w-xl">
              {user.role === "admin"
                ? "Disburse advance funds to employees, track real-time utilization, and reconcile approved expenses automatically."
                : "Track company advance funds provided to you, your available spending balance, and expense deductions in real-time."}
            </p>
          </div>

          {/* Top Quick Actions */}
          <div className="flex items-center gap-3">
            {user.role === "admin" ? (
              <button
                id="admin-pay-advance-btn"
                onClick={() => openPayModalForEmployee()}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Pay Advance</span>
              </button>
            ) : (
              onNavigateToSubmit && (
                <button
                  id="employee-submit-advance-expense-btn"
                  onClick={onNavigateToSubmit}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Submit Advance Claim</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* EMPLOYEE VIEW: Advance Wallet & Personal Balance */}
      {/* ========================================================= */}
      {user.role !== "admin" ? (
        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Available Advance Balance (Primary Focus) */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 rounded-3xl p-4 sm:p-5 border border-emerald-200/80 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-black text-emerald-800 tracking-wider truncate">
                  Available Advance Balance
                </span>
                <span className="p-2 bg-emerald-600 text-white rounded-xl shrink-0 shadow-xs">
                  <Wallet className="h-4 w-4" />
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-xl sm:text-2xl lg:text-3xl font-black text-emerald-950 font-mono tracking-tight truncate">
                  ₹{employeeSummary.availableBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="block text-[11px] font-semibold text-emerald-700 mt-1">
                  Ready to spend on expenses
                </span>
              </div>
            </div>

            {/* 2. Total Advance Received */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-bold text-slate-400 tracking-wider truncate">
                  Total Advance Received
                </span>
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                  <ArrowDownLeft className="h-4 w-4" />
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl lg:text-2xl font-black text-slate-900 font-mono tracking-tight truncate">
                  ₹{employeeSummary.totalAdvance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="block text-[11px] text-slate-500 font-medium mt-1">
                  {employeeSummary.activeAdvanceCount} advance payment(s)
                </span>
              </div>
            </div>

            {/* 3. Approved Expenses Deducted */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-bold text-slate-400 tracking-wider truncate">
                  Total Amount Used
                </span>
                <span className="p-2 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl lg:text-2xl font-black text-slate-900 font-mono tracking-tight truncate">
                  ₹{employeeSummary.totalUsed.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="block text-[11px] text-purple-700 font-medium mt-1">
                  {employeeSummary.approvedClaimsCount} approved deduction(s)
                </span>
              </div>
            </div>

            {/* 4. Pending Claims Waiting for Approval */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-bold text-slate-400 tracking-wider truncate">
                  Pending Approvals
                </span>
                <span className="p-2 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                  <Clock className="h-4 w-4" />
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl lg:text-2xl font-black text-amber-700 font-mono tracking-tight truncate">
                  ₹{employeeSummary.pendingAdvanceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="block text-[11px] text-amber-600 font-medium mt-1">
                  {employeeSummary.pendingClaimsCount} claim(s) under review
                </span>
              </div>
            </div>
          </div>

          {/* Advance Balance Statement — Grouped Per Advance */}
          {(() => {
            const myBuckets = buildAdvanceBuckets({
              ...user,
              // ensure we pass a full EmployeeProfile shape
            } as EmployeeProfile);

            if (myBuckets.length === 0) {
              return (
                <div className="bg-white rounded-3xl border border-slate-100 p-10 shadow-sm text-center text-slate-400 space-y-2">
                  <Wallet className="h-8 w-8 mx-auto text-slate-300" />
                  <p className="text-sm font-semibold">No advance payments have been issued yet.</p>
                  <p className="text-xs">When the Admin issues an advance payment, it will appear here automatically.</p>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {myBuckets.map((bucket) => {
                  const usagePct = bucket.advanceAmount > 0
                    ? Math.min(100, (bucket.spentInBucket / bucket.advanceAmount) * 100)
                    : 0;

                  return (
                    <div
                      key={bucket.advance.id}
                      className={`rounded-3xl border shadow-sm overflow-hidden ${
                        bucket.isCancelled
                          ? "border-slate-200 bg-slate-50/60 opacity-60"
                          : bucket.isFullyUsed
                          ? "border-emerald-200 bg-emerald-50/30"
                          : "border-indigo-200 bg-white"
                      }`}
                    >
                      {/* Advance Header Row */}
                      <div className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        bucket.isCancelled
                          ? "bg-slate-100/60"
                          : bucket.isFullyUsed
                          ? "bg-emerald-600"
                          : "bg-indigo-600"
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shadow-xs ${
                            bucket.isCancelled ? "bg-slate-200 text-slate-500" : "bg-white/20 text-white"
                          }`}>
                            #{bucket.advanceIndex}
                          </div>
                          <div>
                            <span className={`block text-sm font-black ${
                              bucket.isCancelled ? "text-slate-500" : "text-white"
                            }`}>
                              Advance #{bucket.advanceIndex}: ₹{bucket.advanceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                            <span className={`block text-[11px] font-medium ${
                              bucket.isCancelled ? "text-slate-400" : "text-white/70"
                            }`}>
                              Paid on {bucket.advance.paymentDate || bucket.advance.createdAt?.split("T")[0] || "—"}
                              {bucket.advance.purpose ? ` · ${bucket.advance.purpose}` : ""}
                              {bucket.advance.paymentMethod ? ` · ${bucket.advance.paymentMethod}` : ""}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {bucket.isCancelled ? (
                            <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-wider">
                              Cancelled
                            </span>
                          ) : bucket.isFullyUsed ? (
                            <span className="px-3 py-1 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Fully Used
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              ₹{bucket.remainingInBucket.toLocaleString("en-IN", { minimumFractionDigits: 2 })} left
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Usage Progress Bar */}
                      {!bucket.isCancelled && (
                        <div className="px-5 pt-3 pb-1">
                          <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                            <span className="text-slate-400">Spent: ₹{bucket.spentInBucket.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                            <span className={bucket.isFullyUsed ? "text-emerald-700" : "text-indigo-600"}>{usagePct.toFixed(0)}% used</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                bucket.isFullyUsed ? "bg-emerald-500" : "bg-indigo-500"
                              }`}
                              style={{ width: `${usagePct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Expenses within this advance */}
                      <div className="px-5 pb-4 pt-2">
                        {bucket.rows.length === 0 ? (
                          <div className="py-6 text-center text-slate-400 text-xs italic">
                            No expenses claimed against this advance yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto mt-2">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                                  <th className="py-2 px-3">Date</th>
                                  <th className="py-2 px-3">Title</th>
                                  <th className="py-2 px-3">Voucher</th>
                                  <th className="py-2 px-3">Vendor</th>
                                  <th className="py-2 px-3 text-right">Amount</th>
                                  <th className="py-2 px-3 text-right">Balance Left</th>
                                  <th className="py-2 px-3 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {bucket.rows.map((row) => (
                                  <tr key={row.expense.id} className="hover:bg-slate-50/60">
                                    <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">{row.date}</td>
                                    <td className="py-2.5 px-3 font-bold text-slate-800">{row.expense.title}</td>
                                    <td className="py-2.5 px-3 font-mono text-indigo-600 whitespace-nowrap">{row.expense.voucherNumber || "—"}</td>
                                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{row.expense.vendor || "—"}</td>
                                    <td className="py-2.5 px-3 text-right font-black font-mono whitespace-nowrap">
                                      <span className={
                                        row.status === "approved" || row.status === "reimbursed"
                                          ? "text-purple-700"
                                          : row.status === "rejected"
                                          ? "line-through text-slate-400"
                                          : "text-amber-700"
                                      }>
                                        -₹{row.amount.toFixed(2)}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono font-black text-slate-800 whitespace-nowrap">
                                      {(row.status === "approved" || row.status === "reimbursed")
                                        ? `₹${row.runningBalanceInBucket.toFixed(2)}`
                                        : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                        row.status === "approved" || row.status === "reimbursed"
                                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : row.status === "rejected"
                                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                                          : "bg-amber-50 text-amber-700 border border-amber-200"
                                      }`}>
                                        {row.status === "approved" || row.status === "reimbursed"
                                          ? "Deducted"
                                          : row.status === "rejected"
                                          ? "Rejected"
                                          : "Pending"}
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
                  );
                })}
              </div>
            );
          })()}
        </div>
      ) : (
        /* ========================================================= */
        /* ADMIN VIEW: Corporate Advance Pool & Employee Ledger */
        /* ========================================================= */
        <div className="space-y-6">
          {/* Admin KPI Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Advance Disbursed */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-bold text-slate-400 tracking-wider truncate">
                  Total Advance Pool
                </span>
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                  <Building2 className="h-4 w-4" />
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl lg:text-2xl font-black text-slate-900 font-mono tracking-tight truncate">
                  ₹{totalCompanyAdvance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="block text-[11px] text-slate-500 font-medium mt-1">
                  Issued across all staff
                </span>
              </div>
            </div>

            {/* Total Approved Deductions */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-bold text-slate-400 tracking-wider truncate">
                  Total Expenses Used
                </span>
                <span className="p-2 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                  <Receipt className="h-4 w-4" />
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl lg:text-2xl font-black text-slate-900 font-mono tracking-tight truncate">
                  ₹{totalCompanyUsed.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="block text-[11px] text-purple-700 font-medium mt-1">
                  Reconciled via approved claims
                </span>
              </div>
            </div>

            {/* Outstanding Balance Held by Staff */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 rounded-3xl p-4 sm:p-5 border border-emerald-200/80 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-black text-emerald-800 tracking-wider truncate">
                  Outstanding Balance
                </span>
                <span className="p-2 bg-emerald-600 text-white rounded-xl shrink-0 shadow-xs">
                  <Wallet className="h-4 w-4" />
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl lg:text-2xl font-black text-emerald-950 font-mono tracking-tight truncate">
                  ₹{totalCompanyOutstandingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="block text-[11px] text-emerald-700 font-semibold mt-1">
                  Remaining in staff wallets
                </span>
              </div>
            </div>

            {/* Total Advances Issued Count */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-bold text-slate-400 tracking-wider truncate">
                  Active Advance Records
                </span>
                <span className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                  <History className="h-4 w-4" />
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl lg:text-2xl font-black text-slate-900 font-mono tracking-tight truncate">
                  {advances.filter(a => a.status !== "cancelled").length}
                </span>
                <span className="block text-[11px] text-slate-500 font-medium mt-1">
                  {employees.length} registered employees
                </span>
              </div>
            </div>
          </div>

          {/* Employee-Wise Advance Balance Table */}
          <div className="bg-white rounded-3xl border border-slate-100 p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Employee Advance Ledger & Balances
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time advance balances for each employee. Staff ID is not required.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search employee name or email..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none w-56 sm:w-64 transition"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => openPayModalForEmployee()}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>Pay Advance</span>
                </button>
              </div>
            </div>

            {employeeTableRows.length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic text-xs">
                No matching employees found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-3 text-right">Total Advance</th>
                      <th className="py-3 px-3 text-right">Expenses Used</th>
                      <th className="py-3 px-3 text-right">Available Balance</th>
                      <th className="py-3 px-3 text-center">Pending Claims</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employeeTableRows.map((row) => (
                      <tr key={row.profile.employeeId} className="hover:bg-slate-50/60 transition">
                        {/* Employee: Name, Avatar, Email (Staff ID is NOT shown) */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                              {row.profile.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="block font-bold text-slate-800 text-sm">{row.profile.name}</span>
                              <span className="block text-[11px] text-slate-400 font-normal">{row.profile.email}</span>
                            </div>
                          </div>
                        </td>

                        {/* Total Advance */}
                        <td className="py-3 px-3 text-right font-black font-mono text-slate-800 whitespace-nowrap">
                          ₹{row.totalAdvance.toFixed(2)}
                        </td>

                        {/* Expenses Used */}
                        <td className="py-3 px-3 text-right font-black font-mono text-purple-700 whitespace-nowrap">
                          ₹{row.totalUsed.toFixed(2)}
                        </td>

                        {/* Remaining Balance */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <span className={`inline-block font-black font-mono px-2.5 py-1 rounded-xl text-xs ${
                            row.availableBalance > 0
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-400"
                          }`}>
                            ₹{row.availableBalance.toFixed(2)}
                          </span>
                        </td>

                        {/* Pending Claims */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {row.pendingClaimsCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title={`₹${row.pendingAdvanceAmount.toFixed(2)} pending approval`}>
                              <Clock className="h-3 w-3" />
                              {row.pendingClaimsCount} (₹{row.pendingAdvanceAmount.toFixed(0)})
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => openPayModalForEmployee(row.profile)}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                              title={`Pay advance to ${row.profile.name}`}
                            >
                              <PlusCircle className="h-3 w-3" />
                              Pay Advance
                            </button>

                            <button
                              type="button"
                              onClick={() => setStatementEmployee(row.profile)}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                              title={`View full advance statement for ${row.profile.name}`}
                            >
                              <History className="h-3 w-3" />
                              Statement
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PAY ADVANCE (ADMIN ONLY) */}
      {/* ========================================================= */}
      <AnimatePresence>
        {isPayModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Disburse Advance Payment</h3>
                    <p className="text-[11px] text-slate-400">Funds are immediately added to the employee's available advance balance</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handlePayAdvanceSubmit} className="p-6 space-y-4 text-xs">
                {actionMessage && (
                  <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                    actionMessage.type === "error" 
                      ? "bg-rose-50 text-rose-700 border-rose-200" 
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}>
                    {actionMessage.type === "error" ? <AlertCircle className="h-4 w-4 flex-shrink-0" /> : <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
                    <span>{actionMessage.text}</span>
                  </div>
                )}

                {/* 1. Employee Selector (Identified purely by Name and Email - NO Staff ID) */}
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                    Employee Name*
                  </label>
                  <select
                    value={formEmployeeEmail}
                    onChange={(e) => {
                      setFormEmployeeEmail(e.target.value);
                      const found = employees.find(emp => emp.email === e.target.value);
                      setSelectedEmployeeForPay(found || null);
                    }}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-xs font-semibold transition cursor-pointer"
                  >
                    <option value="">-- Select Employee --</option>
                    {employees.map(emp => (
                      <option key={emp.employeeId} value={emp.email}>
                        {emp.name} ({emp.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Advance Amount */}
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                    Advance Amount (₹)*
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-bold font-mono">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="e.g. 10000"
                      className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-bold text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                    />
                  </div>
                </div>

                {/* 3. Payment Date & Method */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                      Payment Date*
                    </label>
                    <input
                      type="date"
                      required
                      value={formPaymentDate}
                      onChange={(e) => setFormPaymentDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                      Payment Method*
                    </label>
                    <select
                      value={formPaymentMethod}
                      onChange={(e) => setFormPaymentMethod(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition cursor-pointer"
                    >
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="UPI">UPI</option>
                      <option value="Cash">Cash</option>
                      <option value="Company Card">Company Card</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* 4. Purpose / Description */}
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                    Purpose or Description*
                  </label>
                  <input
                    type="text"
                    required
                    value={formPurpose}
                    onChange={(e) => setFormPurpose(e.target.value)}
                    placeholder="e.g. Travel to client office / Component purchase"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                  />
                </div>

                {/* 5. Reference / Transaction Number (Optional) */}
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                    Reference / Transaction Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={formReferenceNumber}
                    onChange={(e) => setFormReferenceNumber(e.target.value)}
                    placeholder="e.g. UTR12345678 / IMPS-987654"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                  />
                </div>

                {/* Submit Buttons */}
                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPayModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingPay}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {submittingPay ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    <span>Confirm & Pay Advance</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* MODAL: EMPLOYEE ADVANCE DETAILED STATEMENT LEDGER */}
      {/* ========================================================= */}
      <AnimatePresence>
        {statementEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Statement Header */}
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                    {statementEmployee.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">{statementEmployee.name}</h3>
                    <p className="text-[11px] text-slate-400">{statementEmployee.email} · Advance Account Statement</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStatementEmployee(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Statement Summary Cards */}
              {(() => {
                const summary = calculateAdvanceSummary(
                  statementEmployee.employeeId,
                  advances,
                  expenses,
                  statementEmployee.email,
                  statementEmployee.name
                );
                return (
                  <div className="p-5 bg-slate-50 border-b border-slate-200/80 grid grid-cols-3 gap-3 shrink-0">
                    <div className="bg-white p-3 rounded-2xl border border-slate-200/60 shadow-2xs">
                      <span className="block text-[10px] uppercase font-bold text-slate-400">Total Advance Paid</span>
                      <span className="block text-base font-black font-mono text-slate-800 mt-0.5">₹{summary.totalAdvance.toFixed(2)}</span>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-slate-200/60 shadow-2xs">
                      <span className="block text-[10px] uppercase font-bold text-slate-400">Approved Deductions</span>
                      <span className="block text-base font-black font-mono text-purple-700 mt-0.5">₹{summary.totalUsed.toFixed(2)}</span>
                    </div>
                    <div className="bg-emerald-50/80 p-3 rounded-2xl border border-emerald-200 shadow-2xs">
                      <span className="block text-[10px] uppercase font-black text-emerald-800">Current Balance</span>
                      <span className="block text-base font-black font-mono text-emerald-950 mt-0.5">₹{summary.availableBalance.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Statement: Grouped Per-Advance Buckets */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {(() => {
                  const buckets = buildAdvanceBuckets(statementEmployee);

                  if (buckets.length === 0) {
                    return (
                      <div className="py-12 text-center text-slate-400 italic text-xs">
                        No advance credits or deductions recorded yet for this employee.
                      </div>
                    );
                  }

                  return buckets.map((bucket) => {
                    const usagePct = bucket.advanceAmount > 0
                      ? Math.min(100, (bucket.spentInBucket / bucket.advanceAmount) * 100)
                      : 0;

                    return (
                      <div
                        key={bucket.advance.id}
                        className={`rounded-2xl border overflow-hidden ${
                          bucket.isCancelled
                            ? "border-slate-200 bg-slate-50/60 opacity-60"
                            : bucket.isFullyUsed
                            ? "border-emerald-200"
                            : "border-indigo-200"
                        }`}
                      >
                        {/* Advance Header */}
                        <div className={`px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          bucket.isCancelled
                            ? "bg-slate-100"
                            : bucket.isFullyUsed
                            ? "bg-emerald-600"
                            : "bg-indigo-600"
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                              bucket.isCancelled ? "bg-slate-200 text-slate-500" : "bg-white/20 text-white"
                            }`}>
                              #{bucket.advanceIndex}
                            </div>
                            <div className="min-w-0">
                              <span className={`block text-sm font-black truncate ${
                                bucket.isCancelled ? "text-slate-500" : "text-white"
                              }`}>
                                Advance #{bucket.advanceIndex} — ₹{bucket.advanceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </span>
                              <span className={`block text-[10px] font-medium ${
                                bucket.isCancelled ? "text-slate-400" : "text-white/70"
                              }`}>
                                {bucket.advance.paymentDate || bucket.advance.createdAt?.split("T")[0] || "—"}
                                {bucket.advance.purpose ? ` · ${bucket.advance.purpose}` : ""}
                                {bucket.advance.paymentMethod ? ` · ${bucket.advance.paymentMethod}` : ""}
                                {bucket.advance.referenceNumber ? ` · Ref: ${bucket.advance.referenceNumber}` : ""}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Admin Cancel Button */}
                            {user.role === "admin" && !bucket.isCancelled && (
                              <button
                                type="button"
                                onClick={() => handleCancelAdvance(bucket.advance)}
                                className="px-2.5 py-1 text-[10px] font-bold text-white/80 hover:text-white border border-white/30 hover:border-white/60 rounded-lg transition cursor-pointer"
                                title="Cancel this advance payment"
                              >
                                Cancel
                              </button>
                            )}

                            {bucket.isCancelled ? (
                              <span className="px-2.5 py-1 rounded-full bg-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-wider">
                                Cancelled
                              </span>
                            ) : bucket.isFullyUsed ? (
                              <span className="px-2.5 py-1 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Fully Used
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                ₹{bucket.remainingInBucket.toLocaleString("en-IN", { minimumFractionDigits: 2 })} left
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar */}
                        {!bucket.isCancelled && (
                          <div className="px-4 pt-2.5 pb-1 bg-white border-b border-slate-100">
                            <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                              <span className="text-slate-400">Spent: ₹{bucket.spentInBucket.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                              <span className={bucket.isFullyUsed ? "text-emerald-700" : "text-indigo-600"}>{usagePct.toFixed(0)}% used</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  bucket.isFullyUsed ? "bg-emerald-500" : "bg-indigo-500"
                                }`}
                                style={{ width: `${usagePct}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Expenses within this advance bucket */}
                        <div className="bg-white px-4 pb-3">
                          {bucket.rows.length === 0 ? (
                            <div className="py-5 text-center text-slate-400 text-xs italic">
                              No expenses claimed against this advance yet.
                            </div>
                          ) : (
                            <table className="w-full text-left text-xs border-collapse mt-2">
                              <thead>
                                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                                  <th className="py-2 px-2">Date</th>
                                  <th className="py-2 px-2">Title</th>
                                  <th className="py-2 px-2">Voucher</th>
                                  <th className="py-2 px-2">Vendor</th>
                                  <th className="py-2 px-2 text-right">Amount</th>
                                  <th className="py-2 px-2 text-right">Balance Left</th>
                                  <th className="py-2 px-2 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {bucket.rows.map((row) => (
                                  <tr key={row.expense.id} className="hover:bg-slate-50/70 transition">
                                    <td className="py-2.5 px-2 font-mono text-slate-500 whitespace-nowrap">{row.date}</td>
                                    <td className="py-2.5 px-2 font-bold text-slate-800">{row.expense.title}</td>
                                    <td className="py-2.5 px-2 font-mono text-indigo-600 whitespace-nowrap">{row.expense.voucherNumber || "—"}</td>
                                    <td className="py-2.5 px-2 text-slate-500 whitespace-nowrap">{row.expense.vendor || "—"}</td>
                                    <td className="py-2.5 px-2 text-right font-black font-mono whitespace-nowrap">
                                      <span className={
                                        row.status === "approved" || row.status === "reimbursed"
                                          ? "text-purple-700"
                                          : row.status === "rejected"
                                          ? "line-through text-slate-400"
                                          : "text-amber-600"
                                      }>
                                        -₹{row.amount.toFixed(2)}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono font-black whitespace-nowrap">
                                      {(row.status === "approved" || row.status === "reimbursed")
                                        ? <span className="text-slate-800">₹{row.runningBalanceInBucket.toFixed(2)}</span>
                                        : <span className="text-slate-300">—</span>
                                      }
                                    </td>
                                    <td className="py-2.5 px-2 text-center whitespace-nowrap">
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                        row.status === "approved" || row.status === "reimbursed"
                                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : row.status === "rejected"
                                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                                          : "bg-amber-50 text-amber-700 border border-amber-200"
                                      }`}>
                                        {row.status === "approved" || row.status === "reimbursed"
                                          ? "Deducted"
                                          : row.status === "rejected"
                                          ? "Rejected"
                                          : "Pending"}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Statement Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setStatementEmployee(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Close Statement
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
