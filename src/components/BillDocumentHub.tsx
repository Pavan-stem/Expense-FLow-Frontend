import React, { useState, useEffect } from "react";
import { 
  getExpenses, 
  subscribeToExpenses,
  subscribeToExpensesByEmployee,
  getEmployees, 
  getBillData,
  deleteExpense,

  type EmployeeProfile, 
  type Expense, 
  type BillFile 
} from "../lib/firebase";
import { 
  collectBillItems, 
  exportBillsToWordDocx, 
  exportBillsToPDF, 
  generateBillFilename, 
  type FlatBillItem 
} from "../lib/billDocumentGenerator";
import { 
  FileText, 
  Download, 
  Search, 
  Filter, 
  Grid, 
  Eye, 
  Check, 
  Calendar, 
  User, 
  RefreshCw, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  X, 
  Layers, 
  Sparkles,
  FileCheck,
  CheckSquare,
  Square,
  Trash2
} from "lucide-react";

interface BillDocumentHubProps {
  user: EmployeeProfile;
  refreshTrigger?: number;
}

export default function BillDocumentHub({ user, refreshTrigger = 0 }: BillDocumentHubProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toLocaleString("default", { month: "long" }));
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [gridDensity, setGridDensity] = useState<9 | 12>(12); // 9 or 12 images per document sheet

  // Selection
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());

  // Document Generation Status
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [genProgressMsg, setGenProgressMsg] = useState<string>("");

  // Preview Modal
  const [previewingBill, setPreviewingBill] = useState<FlatBillItem | null>(null);
  const [loadingBillData, setLoadingBillData] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // Admin Delete Voucher State
  const [deletingBillItem, setDeletingBillItem] = useState<FlatBillItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDeleteBillVoucher = async () => {
    if (!deletingBillItem) return;
    setIsDeleting(true);
    try {
      await deleteExpense(deletingBillItem.expenseId, user.employeeId, user.name);
      setDeletingBillItem(null);
    } catch (err) {
      console.error("Error deleting expense voucher in Bill Document Hub:", err);
    } finally {
      setIsDeleting(false);
    }
  };


  const isAdmin = user.role === "admin";

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const expData = await getExpenses();
      setExpenses(expData);

      if (isAdmin) {
        const empData = await getEmployees();
        setEmployees(empData);
      }
    } catch (err) {
      console.error("Error fetching data for Bill Document Hub:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const unsub = isAdmin
      ? subscribeToExpenses((updatedData) => {
          setExpenses(updatedData);
          setLoading(false);
        })
      : subscribeToExpensesByEmployee(user.employeeId, (updatedData) => {
          setExpenses(updatedData);
          setLoading(false);
        });

    if (isAdmin) {
      getEmployees().then(empData => setEmployees(empData));
    }

    return () => unsub();
  }, [user.employeeId, isAdmin, refreshTrigger]);


  const monthsList = [
    "All", "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];
  const yearsList = ["2024", "2025", "2026", "2027"];

  // Filter expenses based on user role and filters
  const filteredExpenses = expenses.filter((exp) => {
    // Role filter
    if (!isAdmin && exp.employeeId !== user.employeeId) {
      return false;
    }
    // Employee selector filter (Admin)
    if (isAdmin && selectedEmployeeId !== "all" && exp.employeeId !== selectedEmployeeId) {
      return false;
    }
    // Year filter
    if (selectedYear !== "All") {
      const expYear = new Date(exp.date).getFullYear().toString();
      if (expYear !== selectedYear) return false;
    }
    // Month filter
    if (selectedMonth !== "All") {
      const expMonth = new Date(exp.date).toLocaleString("default", { month: "long" });
      if (expMonth !== selectedMonth) return false;
    }

    return true;
  });

  // Flat list of all bills matching filter
  const allFilteredBills: FlatBillItem[] = [];
  filteredExpenses.forEach((exp) => {
    (exp.bills || []).forEach((bill) => {
      // Search query filter
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        bill.fileName?.toLowerCase().includes(q) ||
        exp.title?.toLowerCase().includes(q) ||
        exp.vendor?.toLowerCase().includes(q) ||
        exp.employeeName?.toLowerCase().includes(q) ||
        exp.voucherNumber?.toLowerCase().includes(q) ||
        exp.billNumber?.toLowerCase().includes(q);

      if (matchSearch) {
        allFilteredBills.push({
          billId: bill.id,
          expenseId: exp.id,
          fileName: bill.fileName || "Bill",
          fileType: bill.fileType || "image/jpeg",
          fileData: bill.fileData,
          uploadDate: bill.uploadDate || exp.date,
          employeeName: exp.employeeName || "Employee",
          employeeId: exp.employeeId || "EMP",
          voucherNumber: exp.voucherNumber || exp.billNumber || "N/A",
          expenseTitle: exp.title,
          vendor: exp.vendor,
          amount: exp.totalAmount || exp.amount,
          expenseDate: exp.date,
          category: exp.category,
        });
      }
    });
  });

  // Bills to include in document (either explicitly selected or all filtered)
  const billsToExport =
    selectedBillIds.size > 0
      ? allFilteredBills.filter((b) => selectedBillIds.has(b.billId))
      : allFilteredBills;

  // Selected Employee Name for Filename
  let activeEmployeeName = user.name;
  if (isAdmin) {
    if (selectedEmployeeId === "all") {
      activeEmployeeName = "All_Employees";
    } else {
      const targetEmp = employees.find((e) => e.employeeId === selectedEmployeeId);
      if (targetEmp) activeEmployeeName = targetEmp.name;
    }
  }

  // Multi-select handlers
  const handleToggleSelectAll = () => {
    if (selectedBillIds.size === allFilteredBills.length) {
      setSelectedBillIds(new Set());
    } else {
      setSelectedBillIds(new Set(allFilteredBills.map((b) => b.billId)));
    }
  };

  const handleToggleSelectBill = (billId: string) => {
    const next = new Set(selectedBillIds);
    if (next.has(billId)) {
      next.delete(billId);
    } else {
      next.add(billId);
    }
    setSelectedBillIds(next);
  };

  // Preview Bill Modal Handler
  const handleOpenPreview = async (item: FlatBillItem) => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    if (item.fileData) {
      setPreviewingBill(item);
      return;
    }
    setLoadingBillData(true);
    setPreviewingBill(item);
    try {
      const fullData = await getBillData(item.expenseId, item.billId);
      setPreviewingBill({
        ...item,
        fileData: fullData,
      });
    } catch (err) {
      console.error("Error loading bill image preview:", err);
    } finally {
      setLoadingBillData(false);
    }
  };

  // Export Word (.docx) Handler
  const handleExportDocx = async () => {
    if (billsToExport.length === 0) return;
    setIsGeneratingDocx(true);
    setGenProgressMsg("Gathering bill image data...");
    try {
      // Find full expense objects for these bills
      const relevantExpenseIds = Array.from(new Set(billsToExport.map((b) => b.expenseId)));
      const relevantExpenses = expenses.filter((e) => relevantExpenseIds.includes(e.id));

      const fullBillItems = await collectBillItems(relevantExpenses, (current, total) => {
        setGenProgressMsg(`Loading bill data (${current}/${total})...`);
      });

      // Filter to only those in billsToExport
      const exportSetIds = new Set(billsToExport.map((b) => b.billId));
      const itemsToExport = fullBillItems.filter((i) => exportSetIds.has(i.billId));

      await exportBillsToWordDocx(
        itemsToExport,
        activeEmployeeName,
        gridDensity,
        (statusMsg) => setGenProgressMsg(statusMsg)
      );
    } catch (err) {
      console.error("Failed to generate Word document:", err);
      alert("Error generating Word document. Please try again.");
    } finally {
      setIsGeneratingDocx(false);
      setGenProgressMsg("");
    }
  };

  // Export PDF Handler
  const handleExportPdf = async () => {
    if (billsToExport.length === 0) return;
    setIsGeneratingPdf(true);
    setGenProgressMsg("Gathering bill image data...");
    try {
      const relevantExpenseIds = Array.from(new Set(billsToExport.map((b) => b.expenseId)));
      const relevantExpenses = expenses.filter((e) => relevantExpenseIds.includes(e.id));

      const fullBillItems = await collectBillItems(relevantExpenses, (current, total) => {
        setGenProgressMsg(`Loading bill data (${current}/${total})...`);
      });

      const exportSetIds = new Set(billsToExport.map((b) => b.billId));
      const itemsToExport = fullBillItems.filter((i) => exportSetIds.has(i.billId));

      await exportBillsToPDF(
        itemsToExport,
        activeEmployeeName,
        gridDensity,
        (statusMsg) => setGenProgressMsg(statusMsg)
      );
    } catch (err) {
      console.error("Failed to generate PDF document:", err);
      alert("Error generating PDF document. Please try again.");
    } finally {
      setIsGeneratingPdf(false);
      setGenProgressMsg("");
    }
  };

  return (
    <div id="bill-document-hub" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white font-sans">
              {isAdmin ? "All Employee Bill Vault & Document Hub" : "My Bills Document"}
            </h2>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Total Bills</span>
            <span className="text-xl font-bold text-white mt-0.5 block">{allFilteredBills.length} Receipts</span>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Download Action Panel */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-500 font-semibold">Employee:</span>
                <select
                  id="filter-employee-select"
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Employees ({employees.length})</option>
                  {employees.map((emp) => (
                    <option key={emp.employeeId} value={emp.employeeId}>
                      {emp.name} ({emp.employeeId})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-500 font-semibold">Month:</span>
              <select
                id="filter-month-select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                {monthsList.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-slate-500 font-semibold">Year:</span>
              <select
                id="filter-year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="All">All Years</option>
                {yearsList.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
              <Grid className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-500 font-semibold">Density:</span>
              <select
                id="select-grid-density"
                value={gridDensity}
                onChange={(e) => setGridDensity(Number(e.target.value) as 9 | 12)}
                className="bg-transparent font-bold text-indigo-700 focus:outline-none cursor-pointer"
              >
                <option value={12}>12 Images / Page (3x4 Grid)</option>
                <option value={9}>9 Images / Page (3x3 Grid)</option>
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              id="search-bills-input"
              type="text"
              placeholder="Search vendor, voucher, title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-sans"
            />
          </div>
        </div>

        {/* Document Action Buttons Banner */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                Ready to Export {billsToExport.length} Bill Image(s)
              </p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Filename:{" "}
                <span className="text-indigo-600 font-semibold">
                  {generateBillFilename(activeEmployeeName, "docx")}
                </span>
              </p>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              id="download-docx-btn"
              onClick={handleExportDocx}
              disabled={isGeneratingDocx || isGeneratingPdf || billsToExport.length === 0}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isGeneratingDocx ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Generating Word Doc...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download Word (.docx)
                </>
              )}
            </button>

            <button
              id="download-pdf-btn"
              onClick={handleExportPdf}
              disabled={isGeneratingDocx || isGeneratingPdf || billsToExport.length === 0}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isGeneratingPdf ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <FileCheck className="h-4 w-4" />
                  Download PDF (.pdf)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress Message Banner */}
        {genProgressMsg && (
          <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 animate-pulse">
            <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
            <span>{genProgressMsg}</span>
          </div>
        )}
      </div>

      {/* Bill Grid / Cards List Section */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Uploaded Bills Gallery ({allFilteredBills.length})
            </h3>

            {allFilteredBills.length > 0 && (
              <button
                id="toggle-select-all-btn"
                onClick={handleToggleSelectAll}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition ml-3 cursor-pointer flex items-center gap-1"
              >
                {selectedBillIds.size === allFilteredBills.length ? (
                  <>
                    <CheckSquare className="h-3.5 w-3.5" /> Deselect All
                  </>
                ) : (
                  <>
                    <Square className="h-3.5 w-3.5" /> Select All ({allFilteredBills.length})
                  </>
                )}
              </button>
            )}
          </div>

          <span className="text-xs text-slate-400 font-semibold">
            Showing aligned preview for export
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center space-y-3">
            <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-500">Loading bill documents database...</p>
          </div>
        ) : allFilteredBills.length === 0 ? (
          <div className="py-12 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-3">
            <FileText className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No uploaded bills found</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No bill attachments match your current filter settings. Try changing the employee, month, or search query.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {allFilteredBills.map((bill, index) => {
              const isSelected = selectedBillIds.has(bill.billId);

              return (
                <div
                  key={`${bill.expenseId}_${bill.billId}_${index}`}
                  className={`group relative rounded-2xl border transition overflow-hidden bg-white shadow-xs hover:shadow-md flex flex-col ${
                    isSelected ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/10" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {/* Card Header Label */}
                  <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                    <div className="flex items-center gap-2 truncate pr-2">
                      <button
                        type="button"
                        onClick={() => handleToggleSelectBill(bill.billId)}
                        className="text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-indigo-600" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-300" />
                        )}
                      </button>
                      <span className="text-xs font-bold text-slate-800 truncate">
                        #{index + 1} {bill.expenseTitle}
                      </span>
                    </div>

                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full shrink-0">
                      ₹{bill.amount}
                    </span>
                  </div>

                  {/* Thumbnail Frame */}
                  <div className="relative h-44 bg-slate-900/5 flex items-center justify-center p-2 overflow-hidden group-hover:bg-slate-900/10 transition">
                    {bill.fileData ? (
                      bill.fileType.includes("pdf") ? (
                        <div className="text-center p-3">
                          <FileText className="h-10 w-10 text-rose-500 mx-auto mb-1" />
                          <span className="text-[10px] font-bold text-slate-600 block truncate max-w-[140px]">
                            {bill.fileName}
                          </span>
                          <span className="text-[9px] text-slate-400">PDF Document</span>
                        </div>
                      ) : (
                        <img
                          src={bill.fileData}
                          alt={bill.fileName}
                          className="h-full w-full object-contain rounded-lg transition duration-300 group-hover:scale-105"
                        />
                      )
                    ) : (
                      <div className="text-center p-3">
                        <FileText className="h-8 w-8 text-indigo-400 mx-auto mb-1" />
                        <span className="text-[10px] text-slate-500 block">Click preview to load</span>
                      </div>
                    )}

                    {/* Preview & Delete Hover Action Overlay */}
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(bill)}
                        className="px-3 py-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-xl text-xs font-bold shadow-md transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5 text-indigo-600" /> Preview
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeletingBillItem(bill)}
                          className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
                          title="Delete Expense Voucher"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card Meta Footer */}
                  <div className="p-3 space-y-1 mt-auto text-[11px] border-t border-slate-100 bg-white">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="truncate max-w-[110px] font-medium text-slate-700">
                        {bill.employeeName}
                      </span>
                      <span className="font-mono text-indigo-600 font-semibold">{bill.voucherNumber}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="truncate max-w-[120px]">{bill.vendor}</span>
                      <span>{bill.uploadDate}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bill Image Preview Modal */}
      {previewingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {previewingBill.fileName}
                </h3>
                <p className="text-xs text-slate-500">
                  Uploaded by <span className="font-semibold text-slate-700">{previewingBill.employeeName}</span> on {previewingBill.uploadDate} (Voucher: {previewingBill.voucherNumber})
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomScale((z) => Math.min(z + 0.25, 3))}
                  className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale((z) => Math.max(z - 0.25, 0.5))}
                  className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition cursor-pointer"
                  title="Reset Zoom"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewingBill(null)}
                  className="p-1.5 rounded-lg bg-slate-200 hover:bg-rose-100 hover:text-rose-600 text-slate-700 transition cursor-pointer ml-2"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Stage */}
            <div className="flex-1 p-6 bg-slate-900 overflow-auto flex items-center justify-center min-h-[360px] relative">
              {loadingBillData ? (
                <div className="text-center space-y-3 text-white">
                  <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin mx-auto" />
                  <p className="text-xs font-semibold">Retrieving high-res bill data from vault...</p>
                </div>
              ) : previewingBill.fileData ? (
                previewingBill.fileType.includes("pdf") ? (
                  <iframe
                    src={previewingBill.fileData}
                    className="w-full h-[500px] rounded-lg border border-slate-800"
                    title="PDF Bill Preview"
                  />
                ) : (
                  <div
                    style={{
                      transform: `scale(${zoomScale}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                      transition: "transform 0.15s ease-out",
                    }}
                    className="max-w-full max-h-[500px] flex items-center justify-center"
                  >
                    <img
                      src={previewingBill.fileData}
                      alt={previewingBill.fileName}
                      className="max-h-[480px] max-w-full object-contain rounded-lg shadow-2xl"
                    />
                  </div>
                )
              ) : (
                <div className="text-slate-400 text-xs">Failed to load bill image data.</div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50 text-xs">
              <span className="text-slate-500">
                Vendor: <strong className="text-slate-700">{previewingBill.vendor}</strong> | Amount: <strong className="text-emerald-600">₹{previewingBill.amount}</strong>
              </span>

              {previewingBill.fileData && (
                <a
                  href={previewingBill.fileData}
                  download={`Receipt_${(previewingBill.employeeName || "Employee").replace(/[^a-zA-Z0-9]/g, "_")}_${previewingBill.fileName}`}
                  className="inline-flex items-center gap-1.5 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
                >
                  <Download className="h-3.5 w-3.5" /> Download File
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Admin Delete Voucher Confirmation Dialog */}
      {deletingBillItem && (
        <div id="hub-delete-bill-backdrop" className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div id="hub-delete-bill-modal" className="w-full max-w-md bg-white border border-slate-100 rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl flex-shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Delete Voucher Claim permanently?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to delete <span className="font-bold">"{deletingBillItem.expenseTitle}"</span> (Bill: {deletingBillItem.fileName})? This will permanently delete the voucher and all associated receipt attachments.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingBillItem(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteBillVoucher}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white rounded-xl transition shadow-md cursor-pointer flex items-center gap-1.5"
              >
                {isDeleting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
