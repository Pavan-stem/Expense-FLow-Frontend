import { useState, useEffect } from "react";
import { 
  getExpenses, 
  getExpensesByEmployee, 
  getEmployees, 
  type EmployeeProfile, 
  type Expense 
} from "../lib/firebase";
import { 
  collectBillItems, 
  exportBillsToWordDocx, 
  exportBillsToPDF 
} from "../lib/billDocumentGenerator";
import { 
  FolderOpen, 
  Download, 
  FileText, 
  Calendar, 
  Table, 
  CheckSquare, 
  Clock, 
  XSquare, 
  DollarSign, 
  Archive,
  RefreshCw,
  FileCheck
} from "lucide-react";

interface ReportsProps {
  user: EmployeeProfile;
  refreshTrigger: number;
}

type ReportType = "monthly" | "yearly" | "employee" | "category" | "pending" | "approved" | "reimbursement";

export default function Reports({ user, refreshTrigger }: ReportsProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [reportType, setReportType] = useState<ReportType>("monthly");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString("default", { month: "long" }));
  const [selectedYear, setSelectedYear] = useState("2026");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      let expData: Expense[] = [];
      if (user.role === "admin") {
        expData = await getExpenses();
        const empData = await getEmployees();
        setEmployees(empData);
        if (empData.length > 0) setSelectedEmployee(empData[0].employeeId);
      } else {
        expData = await getExpensesByEmployee(user.employeeId);
      }
      setExpenses(expData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user.employeeId, refreshTrigger]);

  const monthsList = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const yearsList = ["2024", "2025", "2026", "2027"];

  // Unique categories list
  const uniqueCategories = Array.from(new Set(expenses.map(e => e.category)));

  // Generate Report Table Data
  const getReportData = (): Expense[] => {
    return expenses.filter(exp => {
      const expDate = new Date(exp.date);
      const expMonth = expDate.toLocaleString("default", { month: "long" });
      const expYear = expDate.getFullYear().toString();

      switch (reportType) {
        case "monthly":
          return expMonth === selectedMonth && expYear === selectedYear;
        case "yearly":
          return expYear === selectedYear;
        case "employee":
          return exp.employeeId === (user.role === "admin" ? selectedEmployee : user.employeeId);
        case "category":
          return exp.category === selectedCategory;
        case "pending":
          return exp.status === "pending" || exp.status === "under_review";
        case "approved":
          return exp.status === "approved" || exp.status === "reimbursed";
        case "reimbursement":
          return exp.status === "reimbursed";
        default:
          return true;
      }
    });
  };

  const reportData = getReportData();

  // Financial Stats of Compiled Report
  const totalReportAmount = reportData.reduce((sum, exp) => sum + exp.totalAmount, 0);
  const approvedReportAmount = reportData
    .filter(e => e.status === "approved" || e.status === "reimbursed")
    .reduce((sum, e) => sum + e.totalAmount, 0);
  const pendingReportAmount = reportData
    .filter(e => e.status === "pending" || e.status === "under_review")
    .reduce((sum, e) => sum + e.totalAmount, 0);

  // Export to CSV Function
  const handleExportCSV = () => {
    if (reportData.length === 0) return;

    const formatDateForExcel = (dateStr: string) => {
      if (!dateStr) return "";
      const parts = dateStr.split("-");
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    };

    // Define CSV Headers matching exact voucher bills structure
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

    // Format rows
    const rows = reportData.map((exp, idx) => {
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
    link.setAttribute("download", `Voucher_Bills_${reportType}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Word (.docx) Export Handler (9-12 images per page)
  const [docExportMsg, setDocExportMsg] = useState("");
  const [exportDocxLoading, setExportDocxLoading] = useState(false);
  const [exportPdfLoading, setExportPdfLoading] = useState(false);

  const handleExportReportBillsDocx = async () => {
    if (reportData.length === 0) return;
    setExportDocxLoading(true);
    setDocExportMsg("Processing bill images...");
    try {
      const billItems = await collectBillItems(reportData, (c, t) => {
        setDocExportMsg(`Loading bill data (${c}/${t})...`);
      });
      if (billItems.length === 0) {
        alert("No bill image attachments found in this report set.");
        return;
      }
      const targetEmpName = user.role === "admin" && selectedEmployee ? 
        (employees.find(e => e.employeeId === selectedEmployee)?.name || "Report_Employee") : user.name;
      
      await exportBillsToWordDocx(billItems, targetEmpName, 12, (msg) => setDocExportMsg(msg));
    } catch (err) {
      console.error(err);
      alert("Failed to export Word document.");
    } finally {
      setExportDocxLoading(false);
      setDocExportMsg("");
    }
  };

  const handleExportReportBillsPDF = async () => {
    if (reportData.length === 0) return;
    setExportPdfLoading(true);
    setDocExportMsg("Processing bill images...");
    try {
      const billItems = await collectBillItems(reportData, (c, t) => {
        setDocExportMsg(`Loading bill data (${c}/${t})...`);
      });
      if (billItems.length === 0) {
        alert("No bill image attachments found in this report set.");
        return;
      }
      const targetEmpName = user.role === "admin" && selectedEmployee ? 
        (employees.find(e => e.employeeId === selectedEmployee)?.name || "Report_Employee") : user.name;
      
      await exportBillsToPDF(billItems, targetEmpName, 12, (msg) => setDocExportMsg(msg));
    } catch (err) {
      console.error(err);
      alert("Failed to export PDF document.");
    } finally {
      setExportPdfLoading(false);
      setDocExportMsg("");
    }
  };

  // Sequential Downloading of Receipts for selected month
  const handleDownloadAllBillsOfMonth = () => {
    // Find all expenses in the selected month/year that have bills
    const targetMonthExpenses = expenses.filter(exp => {
      const expDate = new Date(exp.date);
      const expMonth = expDate.toLocaleString("default", { month: "long" });
      const expYear = expDate.getFullYear().toString();
      return expMonth === selectedMonth && expYear === selectedYear && exp.bills.length > 0;
    });

    if (targetMonthExpenses.length === 0) {
      alert(`No digitizing receipt uploads found for ${selectedMonth} ${selectedYear}.`);
      return;
    }

    alert(`Batch downloading receipt files for ${selectedMonth} ${selectedYear}. Please allow any popup blocker permissions.`);

    targetMonthExpenses.forEach((exp) => {
      exp.bills.forEach((bill) => {
        const link = document.createElement("a");
        link.href = bill.fileData;
        link.download = `Receipt_${exp.employeeName.replace(/\s+/g, '_')}_${exp.date}_${bill.fileName}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    });
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 text-sm">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600 mx-auto mb-2" />
        Processing transactional records...
      </div>
    );
  }

  return (
    <div id="reports-view-container" className="py-6 px-4 max-w-7xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 font-sans">Report Compilation & Exports</h2>
          <p className="text-xs text-slate-500 mt-0.5">Generate analytical exports of corporational claim details and digital bills.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="export-csv-btn"
            onClick={handleExportCSV}
            disabled={reportData.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm disabled:opacity-40 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Download Excel / CSV Data
          </button>
        </div>
      </div>

      {docExportMsg && (
        <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 animate-pulse">
          <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
          <span>{docExportMsg}</span>
        </div>
      )}

      {/* Filter and configuration dashboard card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Selection */}
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">1. Select Report Type</label>
            <select
              id="report-type-select"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="px-3 py-2 w-full border border-slate-200 rounded-xl text-slate-900 bg-slate-50 text-xs focus:bg-white outline-none transition"
            >
              <option value="monthly">Monthly Claims Summary</option>
              <option value="yearly">Yearly Total Summary</option>
              <option value="employee">Employee-wise Claim Log</option>
              <option value="category">Category-wise Claim Log</option>
              <option value="pending">Pending Claim Audits</option>
              <option value="approved">Approved & Reimbursed Registry</option>
              <option value="reimbursement">Reimbursement Complete Log</option>
            </select>
          </div>

          {/* Dynamic Inputs based on type */}
          {reportType === "monthly" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Year</label>
                <select
                  id="report-year-select"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-2.5 py-1.5 w-full border border-slate-200 rounded-lg text-slate-900 bg-slate-50 text-xs focus:bg-white outline-none"
                >
                  {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Month</label>
                <select
                  id="report-month-select"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-2.5 py-1.5 w-full border border-slate-200 rounded-lg text-slate-900 bg-slate-50 text-xs focus:bg-white outline-none"
                >
                  {monthsList.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )}

          {reportType === "yearly" && (
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Select Year</label>
              <select
                id="report-yearly-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-2 w-full border border-slate-200 rounded-xl text-slate-900 bg-slate-50 text-xs focus:bg-white outline-none"
              >
                {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {reportType === "employee" && user.role === "admin" && (
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Select Employee</label>
              <select
                id="report-employee-select"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="px-3 py-2 w-full border border-slate-200 rounded-xl text-slate-900 bg-slate-50 text-xs focus:bg-white outline-none"
              >
                {employees.map(emp => (
                  <option key={emp.employeeId} value={emp.employeeId}>{emp.name} ({emp.employeeId})</option>
                ))}
              </select>
            </div>
          )}

          {reportType === "category" && (
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Select Category</label>
              <select
                id="report-category-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 w-full border border-slate-200 rounded-xl text-slate-900 bg-slate-50 text-xs focus:bg-white outline-none"
              >
                <option value="">Choose Category</option>
                {uniqueCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Report Financial Stats */}
        <div className="border border-slate-100 p-4 rounded-xl flex items-center gap-4 bg-slate-50/40 col-span-1 md:col-span-2">
          <div className="space-y-3.5 w-full">
            <span className="block text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100 pb-1.5">Compiled Report Financials</span>
            
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="block text-[10px] text-slate-400">Total Filtered:</span>
                <span className="block font-bold text-slate-800 font-mono mt-0.5">₹{totalReportAmount.toFixed(2)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">Approved:</span>
                <span className="block font-bold text-emerald-600 font-mono mt-0.5">₹{approvedReportAmount.toFixed(2)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">Pending:</span>
                <span className="block font-bold text-amber-600 font-mono mt-0.5">₹{pendingReportAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Utility / Bulk bill downloader */}
        <div className="border border-indigo-100 bg-indigo-50/20 p-4 rounded-xl flex flex-col justify-between">
          <div>
            <span className="block text-[10px] uppercase font-bold text-indigo-700 tracking-wider mb-1.5">Batch Receipt Downloader</span>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Export all uploaded digital receipts for any selected calendar month directly in one batch.
            </p>
          </div>

          <button
            id="batch-download-bills-btn"
            onClick={handleDownloadAllBillsOfMonth}
            className="w-full mt-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Archive className="h-3.5 w-3.5" />
            Download Month Receipts
          </button>
        </div>
      </div>

      {/* Compiled preview table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-2 bg-slate-50">
          <Table className="h-4 w-4 text-indigo-600" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Compiled Report Preview ({reportData.length} records)</span>
        </div>

        {reportData.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs italic">
            No transaction records match the specified filters. Try selecting a different report type or date parameters.
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/55 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                  <th className="py-3 px-6">Voucher No.</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Total Claim</th>
                  <th className="py-3 px-6 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.map(exp => (
                  <tr key={exp.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-6 font-mono font-bold text-slate-900">{exp.voucherNumber || "N/A"}</td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-600 whitespace-nowrap">{exp.date}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{exp.employeeName}</td>
                    <td className="py-3 px-4 font-medium text-slate-700 truncate max-w-xs">{exp.title}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-semibold rounded text-[10px]">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 font-mono">₹{exp.totalAmount.toFixed(2)}</td>
                    <td className="py-3 px-6 text-center whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
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
  );
}
