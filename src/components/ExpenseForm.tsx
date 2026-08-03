import React, { useState, useEffect } from "react";
import {
  submitExpense,
  checkForDuplicateBill,
  type EmployeeProfile,
  type BillFile,
  type Expense
} from "../lib/firebase";
import { Upload, FileText, Image, Trash2, X, AlertTriangle, Sparkles, Receipt, Coins, Eye, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ExpenseFormProps {
  user: EmployeeProfile;
  onSuccess: () => void;
}

export default function ExpenseForm({ user, onSuccess }: ExpenseFormProps) {
  // Form State
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "UPI" | "UPI+Cash" | "Credit Card" | "Debit Card" | "Bank Transfer">("UPI");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [schoolLocationDetails, setSchoolLocationDetails] = useState("");

  const [uploadedBills, setUploadedBills] = useState<BillFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState<Expense | null>(null);
  const [previewBill, setPreviewBill] = useState<BillFile | null>(null);

  // Localized image zoom & pan state
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Reset zoom and pan on file preview change
  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  }, [previewBill]);

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

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Calculate Total Amount
  const parsedAmount = parseFloat(amount) || 0;
  const totalAmount = parseFloat(parsedAmount.toFixed(2));

  // Trigger duplicate check when parameters change
  useEffect(() => {
    const checkDuplicate = async () => {
      const effectiveDescription = expenseCategory === "Others"
        ? customCategory
        : (expenseCategory && schoolLocationDetails ? `${expenseCategory} - ${schoolLocationDetails}` : "");

      if (parsedAmount > 0 && date && effectiveDescription) {
        const potentialDup = await checkForDuplicateBill(parsedAmount, date, effectiveDescription);
        setDuplicateAlert(potentialDup);
      } else {
        setDuplicateAlert(null);
      }
    };

    const delayDebounce = setTimeout(checkDuplicate, 500);
    return () => clearTimeout(delayDebounce);
  }, [amount, date, expenseCategory, customCategory, schoolLocationDetails]);

  // Client side high-resolution image processor for clear bill reading
  const compressImageAndGetBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          // Dynamic compression target parameters - prioritize high clarity for bill readability
          let quality = 0.88;
          let scale = 1.0;
          const TARGET_SIZE_LIMIT = 1200 * 1024; // ~1.2MB target size for high-res bill receipts

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

            // Get high-clarity Base64 Data URL
            return canvas.toDataURL("image/jpeg", currentQuality);
          };

          let dataUrl = performCompression(scale, quality);

          // Gently scale down only if file exceeds chunk limits
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

  // Convert PDF to Base64
  const getPdfBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
    });
  };

  const handleFileUpload = async (files: FileList) => {
    setMessage(null);
    const updated = [...uploadedBills];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileType = file.type;

      // 1. Check for single files exceeding 5MB
      if (file.size > 5 * 1024 * 1024) {
        setMessage({
          type: "error",
          text: `File "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Files must be under 5MB.`
        });
        continue;
      }

      const fileId = "bill_" + Math.random().toString(36).substring(2, 11);

      try {
        let base64 = "";
        if (fileType.includes("image/")) {
          // Compress JPG/PNG recursively
          base64 = await compressImageAndGetBase64(file);
        } else if (fileType.includes("pdf")) {
          // Standard base64 read for PDFs (up to 5MB is fully supported now)
          base64 = await getPdfBase64(file);
        } else {
          setMessage({ type: "error", text: "Unsupported file type. Please upload PDFs, JPGs, or PNGs." });
          continue;
        }

        // 2. Generous total size constraint for performance safety
        const currentTotalSize = updated.reduce((sum, b) => sum + b.fileData.length, 0);
        const MAX_CUMULATIVE_BASE64_SIZE = 15 * 1024 * 1024; // 15MB total limit

        if (currentTotalSize + base64.length > MAX_CUMULATIVE_BASE64_SIZE) {
          setMessage({
            type: "error",
            text: `Cannot upload "${file.name}". The cumulative size of all attached receipts would exceed the limit of 15MB.`
          });
          continue;
        }

        updated.push({
          id: fileId,
          fileName: file.name,
          fileData: base64,
          fileType: fileType,
          uploadDate: new Date().toISOString()
        });
      } catch (err) {
        console.error("Error reading file:", err);
        setMessage({ type: "error", text: `Failed to upload file "${file.name}".` });
      }
    }

    setUploadedBills(updated);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleDeleteBill = (id: string) => {
    setUploadedBills(prev => prev.filter(b => b.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!expenseCategory) {
      setMessage({ type: "error", text: "Please select a Type of Expense." });
      return;
    }

    let finalCategory = expenseCategory;
    let finalDescription = "";

    if (expenseCategory === "Others") {
      if (!customCategory.trim()) {
        setMessage({ type: "error", text: "Please specify the type of expense." });
        return;
      }
      finalCategory = customCategory.trim();
      finalDescription = customCategory.trim();
    } else {
      if (!schoolLocationDetails.trim()) {
        setMessage({ type: "error", text: "Please specify which school and where you went." });
        return;
      }
      finalCategory = expenseCategory;
      finalDescription = `${expenseCategory} - ${schoolLocationDetails.trim()}`;
    }

    if (!amount || !vendor) {
      setMessage({ type: "error", text: "Please fill in all mandatory fields." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await submitExpense({
        employeeId: user.employeeId,
        employeeName: user.name,
        employeeEmail: user.email,
        title: finalDescription,
        category: finalCategory,
        date,
        amount: parsedAmount,
        vendor,
        paymentMethod,
        description: finalDescription,
        totalAmount,
        bills: uploadedBills
      });

      // Clear Form on success
      setAmount("");
      setVendor("");
      setExpenseCategory("");
      setCustomCategory("");
      setSchoolLocationDetails("");
      setUploadedBills([]);
      setDuplicateAlert(null);

      setMessage({ type: "success", text: "Expense claim submitted successfully!" });
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to submit expense." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="expense-form-container" className="max-w-4xl mx-auto py-6 px-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-5 mb-6">
          <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Receipt className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-bold text-slate-900 font-sans">Submit Expense Claim</h2>
            <p className="text-xs text-slate-500 mt-0.5">Submit office expenses, track reimbursements, and upload digital receipts.</p>
          </div>
        </div>

        {message && (
          <div id="form-alert" className={`p-4 rounded-xl border mb-6 text-sm flex gap-2.5 ${message.type === "success"
            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
            : "bg-rose-50 text-rose-700 border-rose-100"
            }`}>
            <span>{message.text}</span>
          </div>
        )}

        {/* Duplicate warning notification */}
        <AnimatePresence>
          {duplicateAlert && (
            <motion.div
              id="duplicate-alert-banner"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl mb-6 text-xs flex gap-3 overflow-hidden"
            >
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Duplicate Bill Detected:</span> An expense with identical parameters already exists:
                <div className="mt-1 font-semibold text-[11px]">
                  • Date: {duplicateAlert.date} | Type of Expense: {duplicateAlert.category} | Amount: ${duplicateAlert.amount}
                </div>
                <div className="mt-1 text-amber-700">
                  Please verify this claim to avoid submit duplications of the same bill.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Type of Expense Field */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">Type of Expense*</label>
            <select
              id="form-expense-category"
              required
              value={expenseCategory}
              onChange={(e) => {
                setExpenseCategory(e.target.value);
                setCustomCategory("");
                setSchoolLocationDetails("");
              }}
              className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm outline-none transition cursor-pointer font-medium"
            >
              <option value="" disabled>-- Select Type of Expense --</option>
              <option value="Travel to School">School Visit</option>
              <option value="Travel for Marketing">Marketing Visit</option>
              <option value="Others">Others</option>
            </select>
          </div>

          {/* Conditional Message Box for Others */}
          <AnimatePresence>
            {expenseCategory === "Others" && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: "auto", marginTop: 16 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">Specify Type of Expense*</label>
                <textarea
                  id="form-custom-category"
                  required
                  rows={2}
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Write the type of expense (e.g. Office Supplies, Food & Refreshments, Components Purchase)..."
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm outline-none transition resize-none"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Conditional Message Box for Travel Options */}
          <AnimatePresence>
            {["Travel to School", "Travel for Marketing", "Travel for workshop to school"].includes(expenseCategory) && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: "auto", marginTop: 16 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">Which school and where did you go?*</label>
                <textarea
                  id="form-school-location-details"
                  required
                  rows={2}
                  value={schoolLocationDetails}
                  onChange={(e) => setSchoolLocationDetails(e.target.value)}
                  placeholder="Write which school and where you went (e.g. Nallagandla, Hyderabad)..."
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm outline-none transition resize-none"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pricing & Date Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">Date of Expense*</label>
              <input
                id="form-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm outline-none transition"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">Amount (₹)*</label>
              <input
                id="form-amount"
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="150.00"
                className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm outline-none transition"
              />
            </div>
          </div>

          {/* Vendors & Payments Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">Paid to*</label>
              <input
                id="form-vendor"
                type="text"
                required
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="John Doe / Uber / Starbucks"
                className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm outline-none transition"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">Payment Method*</label>
              <select
                id="form-payment"
                required
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm outline-none transition"
              >
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="UPI+Cash">UPI+Cash</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Debit Card">Debit Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
          </div>

          {/* Drag & Drop File Upload */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-2">Supporting Bills/Invoices (PDF, JPG, PNG - Max 20MB)</label>
            <div
              id="form-drag-drop-zone"
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById("hidden-file-input")?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center flex flex-col items-center justify-center transition cursor-pointer ${isDragActive
                ? "border-indigo-500 bg-indigo-50/40"
                : "border-slate-200 bg-slate-50 hover:bg-slate-100/60"
                }`}
            >
              <Upload className="h-8 w-8 text-indigo-500 mb-2" />
              <p className="text-xs font-bold text-slate-700">Drag and drop receipts here, or click to choose multiple files</p>
              <p className="text-[10px] text-slate-400 mt-1">Select multiple images (JPG, PNG) or PDFs at once. All receipts are compressed automatically.</p>
              <button
                id="form-file-trigger"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  document.getElementById("hidden-file-input")?.click();
                }}
                className="mt-3 text-xs font-semibold px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl shadow-xs hover:bg-slate-50 transition cursor-pointer"
              >
                Browse Multiple Files
              </button>
              <input
                id="hidden-file-input"
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileUpload(e.target.files);
                    e.target.value = "";
                  }
                }}
                className="hidden"
              />
            </div>

            {/* List of uploaded bills */}
            {uploadedBills.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Uploaded Attachments ({uploadedBills.length})</span>
                  <button
                    type="button"
                    onClick={() => setUploadedBills([])}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove All Files
                  </button>
                </div>
                <div id="form-receipts-list" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {uploadedBills.map((bill) => (
                    <div key={bill.id} className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between gap-3 shadow-2xs hover:border-indigo-200 transition">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="h-10 w-10 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
                          {bill.fileType.includes("pdf") ? (
                            <FileText className="h-5 w-5 text-indigo-500" />
                          ) : (
                            <img
                              src={bill.fileData}
                              alt="Thumbnail preview"
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-slate-800 truncate" title={bill.fileName}>{bill.fileName}</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewBill(bill);
                            }}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-0.5 cursor-pointer"
                          >
                            <Eye className="h-3 w-3" /> View Preview
                          </button>
                        </div>
                      </div>
                      <button
                        id={`delete-uploaded-bill-${bill.id}`}
                        type="button"
                        title="Delete this wrong file"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBill(bill.id);
                        }}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-200 transition cursor-pointer flex-shrink-0 flex items-center justify-center"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Summary Bar */}
          <div className="border-t border-slate-100 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <Coins className="h-5 w-5" />
              </span>
              <div>
                <span className="block text-[10px] uppercase tracking-wider font-bold text-slate-400">Total Claim Amount</span>
                <span id="form-total-display" className="text-xl font-black text-slate-800">₹{totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-3 w-full sm:w-auto justify-end">
              <button
                id="form-submit-claim"
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Submitting Claim..." : "Submit Claim"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* File Preview Lightbox */}
      <AnimatePresence>
        {previewBill && (
          <>
            <div
              id="file-preview-backdrop"
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
              onClick={() => setPreviewBill(null)}
            />
            <motion.div
              id="file-preview-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 top-10 bottom-10 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:h-[650px] bg-white border border-slate-100 rounded-3xl shadow-2xl z-[90] overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-700 truncate max-w-xs md:max-w-md">{previewBill.fileName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    id="delete-preview-bill-btn"
                    type="button"
                    onClick={() => {
                      handleDeleteBill(previewBill.id);
                      setPreviewBill(null);
                    }}
                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                    title="Delete this file"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete File
                  </button>
                  <button
                    id="close-file-preview-btn"
                    type="button"
                    onClick={() => setPreviewBill(null)}
                    className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div
                className="flex-1 bg-slate-100 p-4 flex items-center justify-center overflow-hidden relative"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
              >
                {previewBill.fileType.includes("pdf") ? (
                  <iframe
                    src={previewBill.fileData}
                    className="w-full h-full border-0 rounded-xl bg-white"
                    title="PDF Receipt Preview"
                  />
                ) : (
                  <>
                    <div className="w-full h-full flex items-center justify-center overflow-hidden select-none">
                      <img
                        src={previewBill.fileData}
                        alt={previewBill.fileName}
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
    </div>
  );
}
