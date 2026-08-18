import React, { useState, useEffect } from "react";
import {
  updateExpenseWithBills,
  getBillData,
  type EmployeeProfile,
  type Expense,
  type BillFile
} from "../lib/firebase";
import {
  X,
  Edit3,
  Calendar,
  Building2,
  FileText,
  Upload,
  Trash2,
  Eye,
  AlertCircle,
  CheckCircle,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  RefreshCw,

  Coins,
  ShieldCheck,
  Tag
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface EditExpenseModalProps {
  expense: Expense | null;
  currentUser: EmployeeProfile;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORY_OPTIONS = [
  "School Visit",
  "Travel & Transport",
  "Food & Dining",
  "Office Supplies",
  "Software & Subscriptions",
  "Utilities & Bills",
  "Maintenance & Repairs",
  "Lodging & Accommodation",
  "Others"
];

const PAYMENT_SUB_MODES = [
  "Cash",
  "UPI",
  "UPI+Cash",
  "Credit Card",
  "Debit Card",
  "Bank Transfer"
];

export default function EditExpenseModal({
  expense,
  currentUser,
  isOpen,
  onClose,
  onSuccess
}: EditExpenseModalProps) {
  if (!isOpen || !expense) return null;

  const isAdmin = currentUser.role === "admin";
  const isOwner = expense.employeeId === currentUser.employeeId;
  const canEdit = isAdmin || isOwner;

  // Form State
  const [date, setDate] = useState(expense.date || new Date().toISOString().split("T")[0]);
  const [expenseCategory, setExpenseCategory] = useState<string>(() => {
    if (!expense.category) return "Others";
    if (CATEGORY_OPTIONS.includes(expense.category)) return expense.category;
    return "Others";
  });
  const [customCategory, setCustomCategory] = useState<string>(() => {
    if (expense.category && !CATEGORY_OPTIONS.includes(expense.category)) {
      return expense.category;
    }
    return "";
  });
  const [schoolLocationDetails, setSchoolLocationDetails] = useState<string>(() => {
    if (expense.description && expense.description.includes(" - ")) {
      return expense.description.split(" - ")[1] || "";
    }
    return "";
  });

  const [vendor, setVendor] = useState(expense.vendor || "");
  const [amount, setAmount] = useState<string>((expense.amount || 0).toString());
  const [gstAmount, setGstAmount] = useState<string>((expense.gstAmount || 0).toString());
  
  // Payment mode parsing
  const [paymentType, setPaymentType] = useState<"Personal Payment" | "SW Payment">(() => {
    if (expense.paymentMethod && expense.paymentMethod.startsWith("SW Payment")) return "SW Payment";
    return "Personal Payment";
  });
  const [paymentSubMode, setPaymentSubMode] = useState<string>(() => {
    if (!expense.paymentMethod) return "";
    const match = expense.paymentMethod.match(/\(([^)]+)\)/);
    if (match && match[1]) return match[1];
    if (PAYMENT_SUB_MODES.includes(expense.paymentMethod)) return expense.paymentMethod;
    return "";
  });

  const [status, setStatus] = useState<Expense["status"]>(expense.status || "pending");
  const [adminComments, setAdminComments] = useState<string>(expense.adminComments || "");

  // Bill files state
  const [existingBills, setExistingBills] = useState<BillFile[]>(expense.bills || []);
  const [removedBillIds, setRemovedBillIds] = useState<string[]>([]);
  const [newBills, setNewBills] = useState<BillFile[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  // Bill preview state
  const [previewingBill, setPreviewingBill] = useState<{ file: BillFile; dataUrl: string } | null>(null);
  const [loadingBillId, setLoadingBillId] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [rotateAngle, setRotateAngle] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Submission & alert state
  const [submitting, setSubmitting] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Lock body scrolling while Edit Modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  // Reset preview zoom/pan/rotation
  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setRotateAngle(0);
    setIsPanning(false);
  }, [previewingBill]);



  // Math expression evaluator for Amount
  const parseAmountExpression = (expr: string): number | null => {
    if (!expr || !expr.trim()) return 0;
    const sanitized = expr.trim().replace(/×/g, "*").replace(/÷/g, "/");
    if (!/^[0-9+*/.() -]+$/.test(sanitized)) {
      return null;
    }
    try {
      const func = new Function(`"use strict"; return (${sanitized});`);
      const val = func();
      if (typeof val === "number" && !isNaN(val) && isFinite(val) && val >= 0) {
        return Math.round(val * 100) / 100;
      }
      return null;
    } catch {
      return null;
    }
  };

  const parsedAmount = parseAmountExpression(amount) ?? (parseFloat(amount) || 0);
  const parsedGst = parseFloat(gstAmount) || 0;
  const calculatedTotal = parseFloat((parsedAmount + parsedGst).toFixed(2));

  // High-clarity client side image compression
  const compressImageAndGetBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          let quality = 0.88;
          let scale = 1.0;
          const TARGET_SIZE_LIMIT = 1200 * 1024;

          const performCompression = (currentScale: number, currentQuality: number): string => {
            const canvas = document.createElement("canvas");
            const MAX_WIDTH = 1600 * currentScale;
            const MAX_HEIGHT = 1600 * currentScale;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height = Math.round(height * (MAX_WIDTH / width));
                width = Math.round(MAX_WIDTH);
              }
            } else {
              if (height > MAX_HEIGHT) {
                width = Math.round(width * (MAX_HEIGHT / height));
                height = Math.round(MAX_HEIGHT);
              }
            }

            canvas.width = Math.max(1, width);
            canvas.height = Math.max(1, height);
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
            return canvas.toDataURL("image/jpeg", currentQuality);
          };

          let dataUrl = performCompression(scale, quality);
          if (dataUrl.length > TARGET_SIZE_LIMIT * 1.34) {
            quality = 0.80;
            scale = 0.9;
            dataUrl = performCompression(scale, quality);
          }
          if (dataUrl.length > TARGET_SIZE_LIMIT * 1.34) {
            quality = 0.72;
            scale = 0.8;
            dataUrl = performCompression(scale, quality);
          }
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const getPdfBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
    });
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (!fileArray || fileArray.length === 0) return;
    setAlertMsg(null);
    setIsProcessingFiles(true);

    try {
      const results = await Promise.all(
        fileArray.map(async (file) => {
          const fileType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");

          if (file.size > 10 * 1024 * 1024) {
            return { error: `File "${file.name}" exceeds 10MB limit.` };
          }

          const fileId = "bill_" + Math.random().toString(36).substring(2, 11);

          try {
            let base64 = "";
            if (fileType.includes("image/") || /\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
              base64 = await compressImageAndGetBase64(file);
            } else if (fileType.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) {
              base64 = await getPdfBase64(file);
            } else {
              return { error: `Unsupported file format for "${file.name}".` };
            }

            return {
              bill: {
                id: fileId,
                fileName: file.name,
                fileData: base64,
                fileType: fileType,
                uploadDate: new Date().toISOString()
              }
            };
          } catch (err) {
            console.error("Error processing file:", err);
            return { error: `Failed to process "${file.name}".` };
          }
        })
      );

      const addedBills: BillFile[] = [];
      const errors: string[] = [];
      for (const res of results) {
        if (res.bill) addedBills.push(res.bill);
        else if (res.error) errors.push(res.error);
      }

      if (errors.length > 0) {
        setAlertMsg({ type: "error", text: errors.join(" ") });
      }

      if (addedBills.length > 0) {
        setNewBills(prev => [...prev, ...addedBills]);
      }
    } catch (err: any) {
      console.error("Failed to upload files:", err);
      setAlertMsg({ type: "error", text: "An error occurred while uploading files." });
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleRemoveExistingBill = (billId: string) => {
    setExistingBills(prev => prev.filter(b => b.id !== billId));
    setRemovedBillIds(prev => [...prev, billId]);
  };

  const handleRemoveNewBill = (billId: string) => {
    setNewBills(prev => prev.filter(b => b.id !== billId));
  };

  const handlePreviewBillItem = async (bill: BillFile) => {
    if (bill.fileData) {
      setPreviewingBill({ file: bill, dataUrl: bill.fileData });
      return;
    }

    setLoadingBillId(bill.id);
    try {
      const fullData = await getBillData(expense.id, bill.id);
      if (fullData) {
        setPreviewingBill({ file: bill, dataUrl: fullData });
      } else {
        setAlertMsg({ type: "error", text: "Could not load bill content." });
      }
    } catch (err) {
      console.error("Error loading bill preview:", err);
      setAlertMsg({ type: "error", text: "Failed to load bill preview." });
    } finally {
      setLoadingBillId(null);
    }

  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setAlertMsg({ type: "error", text: "You do not have permission to edit this expense claim." });
      return;
    }

    if (!expenseCategory) {
      setAlertMsg({ type: "error", text: "Please select a Category." });
      return;
    }

    let finalCategory = expenseCategory;
    let finalDescription = "";

    if (expenseCategory === "Others") {
      if (!customCategory.trim()) {
        setAlertMsg({ type: "error", text: "Please specify the custom category name." });
        return;
      }
      finalCategory = customCategory.trim();
      finalDescription = customCategory.trim();
    } else {
      finalCategory = expenseCategory;
      if (schoolLocationDetails.trim()) {
        finalDescription = `${expenseCategory} - ${schoolLocationDetails.trim()}`;
      } else {
        finalDescription = expenseCategory;
      }
    }

    if (!vendor.trim()) {
      setAlertMsg({ type: "error", text: "Please specify the Vendor/Merchant name." });
      return;
    }

    if (parsedAmount <= 0) {
      setAlertMsg({ type: "error", text: "Please enter a valid amount greater than ₹0." });
      return;
    }

    setSubmitting(true);
    setAlertMsg(null);

    const finalPaymentMethod = (paymentSubMode ? `${paymentType} (${paymentSubMode})` : paymentType) as any;

    try {
      const updatedFields: Partial<Expense> = {
        title: finalDescription,
        category: finalCategory,
        date,
        amount: parsedAmount,
        vendor: vendor.trim(),
        paymentMethod: finalPaymentMethod,
        description: finalDescription,
        gstAmount: parsedGst,
        totalAmount: calculatedTotal,
        ...(isAdmin ? { status, adminComments } : {})
      };

      await updateExpenseWithBills(
        expense.id,
        updatedFields,
        newBills,
        removedBillIds,
        currentUser.employeeId,
        currentUser.name,
        currentUser.role
      );

      setAlertMsg({ type: "success", text: "Expense claim updated successfully!" });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error("Failed to update expense:", err);
      setAlertMsg({ type: "error", text: err.message || "Failed to update expense claim." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div id="edit-expense-modal-backdrop" className="fixed inset-0 min-h-screen w-screen bg-slate-950/95 backdrop-blur-md z-[80] flex items-center justify-center p-3 md:p-6 overflow-y-auto">


        <motion.div
          id="edit-expense-modal-card"
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className="relative w-full max-w-3xl my-6 bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl">
                <Edit3 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-sans flex items-center gap-2">
                  Edit Expense Claim
                  {expense.voucherNumber && (
                    <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs rounded-full font-mono font-semibold">
                      {expense.voucherNumber}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Uploaded by: <span className="font-semibold text-slate-700">{expense.employeeName}</span> ({expense.employeeEmail})
                </p>
              </div>
            </div>

            <button
              id="close-edit-expense-modal-btn"
              onClick={onClose}
              className="p-2 hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 rounded-xl transition cursor-pointer"
              title="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
            {!canEdit && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
                <span>You do not have authorization to edit this expense claim.</span>
              </div>
            )}

            {alertMsg && (
              <div className={`p-4 rounded-xl border text-xs flex items-center gap-3 ${
                alertMsg.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-rose-50 text-rose-800 border-rose-200"
              }`}>
                {alertMsg.type === "success" ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
                )}
                <span>{alertMsg.text}</span>
              </div>
            )}

            {/* Date & Vendor Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-indigo-600" /> Expense Date *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  disabled={!canEdit || submitting}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-indigo-600" /> Vendor / Merchant *
                </label>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. Swiggy, HPCL Fuel, Amazon, Local Vendor"
                  required
                  disabled={!canEdit || submitting}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>
            </div>

            {/* Category & Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-indigo-600" /> Expense Category *
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  disabled={!canEdit || submitting}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {expenseCategory === "Others" ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Custom Category Name *
                  </label>
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Specify expense category"
                    required
                    disabled={!canEdit || submitting}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Location / School Details
                  </label>
                  <input
                    type="text"
                    value={schoolLocationDetails}
                    onChange={(e) => setSchoolLocationDetails(e.target.value)}
                    placeholder="e.g. DPS School Visit - Main Branch"
                    disabled={!canEdit || submitting}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>
              )}
            </div>

            {/* Financial Calculations */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
              <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                <Coins className="h-4 w-4" /> Amount & Financial Details
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 250 or 94+94+57"
                    required
                    disabled={!canEdit || submitting}
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                  {amount && amount.includes("+") && (
                    <span className="block text-[10px] text-indigo-600 mt-1 font-mono">
                      Evaluated: ₹{parsedAmount.toFixed(2)}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    GST / Tax Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={gstAmount}
                    onChange={(e) => setGstAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={!canEdit || submitting}
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Total Claim Amount (₹)
                  </label>
                  <div className="w-full px-3.5 py-2 bg-indigo-50/70 border border-indigo-100 rounded-xl text-sm font-bold font-mono text-indigo-700">
                    ₹{calculatedTotal.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200/60 pt-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as any)}
                    disabled={!canEdit || submitting}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="Personal Payment">Personal Payment (Out of Pocket)</option>
                    <option value="SW Payment">SW Payment (Company Paid)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Sub Payment Method
                  </label>
                  <select
                    value={paymentSubMode}
                    onChange={(e) => setPaymentSubMode(e.target.value)}
                    disabled={!canEdit || submitting}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Select Sub-Mode (Optional)</option>
                    {PAYMENT_SUB_MODES.map((sm) => (
                      <option key={sm} value={sm}>{sm}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Admin Override Controls */}
            {isAdmin && (
              <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-amber-600" /> Admin Override & Review Status
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    >
                      <option value="pending">Pending</option>
                      <option value="under_review">Under Review</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="reimbursed">Reimbursed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Admin Edit Remarks / Notes
                    </label>
                    <input
                      type="text"
                      value={adminComments}
                      onChange={(e) => setAdminComments(e.target.value)}
                      placeholder="Specify reason for edit or status change..."
                      className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Bill Attachments Manager */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-indigo-600" /> Attached Receipts & Bills
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  ({existingBills.length + newBills.length} File(s))
                </span>
              </label>

              {/* Existing Bills List */}
              {existingBills.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Existing Attachments</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {existingBills.map((bill) => (
                      <div key={bill.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{bill.fileName}</p>
                            <p className="text-[9px] text-slate-400 font-mono uppercase">{bill.fileType.split("/")[1] || "Document"}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handlePreviewBillItem(bill)}
                            disabled={loadingBillId === bill.id}
                            className="p-1.5 hover:bg-white text-indigo-600 rounded-lg border border-slate-200 transition cursor-pointer"
                            title="Preview File"
                          >
                            {loadingBillId === bill.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleRemoveExistingBill(bill.id)}
                              className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg border border-slate-200 transition cursor-pointer"
                              title="Delete Attachment"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Newly Uploaded Bills List */}
              {newBills.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-emerald-600">New Attachments to Add</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {newBills.map((bill) => (
                      <div key={bill.id} className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{bill.fileName}</p>
                            <span className="inline-block px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[9px] font-semibold rounded">NEW</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handlePreviewBillItem(bill)}
                            className="p-1.5 hover:bg-white text-emerald-700 rounded-lg border border-emerald-200 transition cursor-pointer"
                            title="Preview File"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveNewBill(bill.id)}
                            className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg border border-emerald-200 transition cursor-pointer"
                            title="Remove File"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Dropzone */}
              {canEdit && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
                  onDragLeave={() => setIsDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragActive(false);
                    if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files);
                  }}
                  className={`border-2 border-dashed rounded-2xl p-4 text-center transition cursor-pointer ${
                    isDragActive
                      ? "border-indigo-500 bg-indigo-50/50"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/60"
                  }`}
                >
                  <input
                    type="file"
                    id="edit-modal-file-upload"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                    className="hidden"
                  />
                  <label htmlFor="edit-modal-file-upload" className="cursor-pointer block">
                    <Upload className="h-6 w-6 text-indigo-500 mx-auto mb-1.5" />
                    <span className="text-xs font-bold text-slate-700 block">
                      Click to upload new receipts or drag & drop files
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Supports JPG, PNG, WEBP, and PDF files up to 10MB
                    </span>
                  </label>
                  {isProcessingFiles && (
                    <div className="mt-2 text-xs text-indigo-600 flex items-center justify-center gap-1.5 font-semibold">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing file uploads...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!canEdit || submitting || isProcessingFiles}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving Changes...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" /> Save Expense Claim Edits
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>

      {/* Bill Preview Sub-Modal */}
      {previewingBill && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-[90] flex items-center justify-center p-3 md:p-6">

          <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col h-[85vh] max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 flex-shrink-0">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-indigo-400" />
                <div>
                  <h4 className="text-sm font-bold text-white truncate max-w-md">{previewingBill.file.fileName}</h4>
                  <span className="text-[10px] text-slate-400 uppercase font-mono">{previewingBill.file.fileType}</span>
                </div>
              </div>

              {/* Zoom & Rotation Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomScale(s => Math.min(s + 0.25, 4))}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale(s => Math.max(s - 0.25, 0.5))}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>

                <div className="w-[1px] h-4 bg-slate-800" />

                <button
                  type="button"
                  onClick={() => setRotateAngle(a => (a - 90 + 360) % 360)}
                  className="p-1.5 bg-slate-800 hover:bg-indigo-600 text-indigo-300 rounded-lg text-xs transition cursor-pointer"
                  title="Rotate Left (90°)"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setRotateAngle(a => (a + 90) % 360)}
                  className="p-1.5 bg-slate-800 hover:bg-indigo-600 text-indigo-300 rounded-lg text-xs transition cursor-pointer"
                  title="Rotate Right (90°)"
                >
                  <RotateCw className="h-4 w-4" />
                </button>

                {rotateAngle !== 0 && (
                  <span className="text-[10px] font-bold font-mono text-indigo-400 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-800">
                    {rotateAngle}°
                  </span>
                )}

                <div className="w-[1px] h-4 bg-slate-800" />

                <button
                  type="button"
                  onClick={() => { setZoomScale(1); setPanOffset({ x: 0, y: 0 }); setRotateAngle(0); }}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs cursor-pointer"
                  title="Reset View"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewingBill(null)}
                  className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs ml-2 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Preview Viewport */}
            <div
              className="flex-1 overflow-auto p-4 pb-16 flex items-center justify-center bg-slate-950 select-none relative"

              onMouseDown={(e) => {
                if (zoomScale <= 1) return;
                setIsPanning(true);
                setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
              }}
              onMouseMove={(e) => {
                if (!isPanning) return;
                setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
              }}
              onMouseUp={() => setIsPanning(false)}
              onMouseLeave={() => setIsPanning(false)}
            >
              {previewingBill.file.fileType.includes("pdf") ? (
                <iframe
                  src={previewingBill.dataUrl}
                  className="w-full h-[70vh] rounded-xl border border-slate-800"
                  title="PDF Preview"
                />
              ) : (
                <img
                  src={previewingBill.dataUrl}
                  alt={previewingBill.file.fileName}
                  style={{
                    transform: `scale(${zoomScale}) translate(${panOffset.x / zoomScale}px, ${panOffset.y / zoomScale}px) rotate(${rotateAngle}deg)`,
                    transition: isPanning ? "none" : "transform 0.15s ease-out"
                  }}
                  className="max-h-[75vh] max-w-full object-contain cursor-grab active:cursor-grabbing rounded-xl shadow-2xl"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
