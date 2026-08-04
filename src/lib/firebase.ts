import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  onSnapshot,
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  type DocumentData
} from "firebase/firestore";

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
  oAuthClientId: import.meta.env.VITE_FIREBASE_OAUTH_CLIENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Types
export interface EmployeeProfile {
  id: string; // matches employeeId
  employeeId: string;
  name: string;
  department: string;
  designation: string;
  email: string;
  phone: string;
  manager: string;
  joiningDate: string;
  role: "employee" | "admin";
}

export interface BillFile {
  id: string;
  fileName: string;
  fileData: string; // Base64 Data URL
  fileType: string;
  uploadDate: string;
}

export interface VoucherComment {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: "admin" | "employee";
  message: string;
  timestamp: string;
}

export interface Expense {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  title: string;
  category: string;
  date: string; // YYYY-MM-DD
  amount: number;
  vendor: string;
  paymentMethod: "Cash" | "UPI" | "UPI+Cash" | "Credit Card" | "Debit Card" | "Bank Transfer";
  description: string;
  projectName?: string;
  billNumber?: string;
  gstAmount?: number;
  totalAmount: number;
  status: "pending" | "under_review" | "approved" | "rejected" | "reimbursed";
  adminComments?: string;
  comments?: VoucherComment[];
  createdDate: string;
  bills: BillFile[];
  voucherNumber?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface AppNotification {
  id: string;
  userId: string; // Recipient user
  title: string;
  message: string;
  read: boolean;
  timestamp: string;
  expenseId?: string;
  voucherNumber?: string;
}

// Predefined categories
export const PREDEFINED_CATEGORIES = [
  "Travelling",
  "Components Purchase",
  "Electronics",
  "Stationery",
  "Food & Refreshments",
  "Accommodation",
  "Courier",
  "Office Supplies",
  "Software Subscription",
  "Training",
  "Client Meeting",
  "Miscellaneous"
];

/**
 * Initialize collection templates and pre-populate if needed.
 * This runs on app startup.
 */
export async function seedDatabaseIfNeeded() {
  try {
    // 1. Seed categories
    const categoriesCol = collection(db, "categories");
    const categoriesSnap = await getDocs(categoriesCol);
    if (categoriesSnap.empty) {
      console.log("Seeding expense categories...");
      for (const cat of PREDEFINED_CATEGORIES) {
        const id = cat.toLowerCase().replace(/[^a-z0-9]/g, "_");
        await setDoc(doc(categoriesCol, id), { id, name: cat });
      }
    }

    // Database initialized without hardcoded root admin
    console.log("Database initialized.");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

function cacheUserLocally(email: string, password: string, profile: EmployeeProfile) {
  try {
    const raw = localStorage.getItem("ef_cached_users");
    const list = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((u: any) => u.email !== email);
    filtered.push({ email, password, profile });
    localStorage.setItem("ef_cached_users", JSON.stringify(filtered));
  } catch (e) {
    console.warn("Could not cache user locally", e);
  }
}

function getLocalUsersCache(): Array<{ email: string; password: string; profile: EmployeeProfile }> {
  try {
    const raw = localStorage.getItem("ef_cached_users");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function loginWithEmailAndPassword(email: string, password: string): Promise<EmployeeProfile | null> {
  const cleanEmail = email.toLowerCase().trim();

  try {
    const credRef = doc(db, "user_credentials", cleanEmail);
    const credSnap = await getDoc(credRef);
    if (!credSnap.exists()) {
      const cached = getLocalUsersCache().find(u => u.email === cleanEmail && u.password === password);
      return cached ? cached.profile : null;
    }
    
    const credData = credSnap.data();
    if (credData.password !== password) return null;
    
    const userRef = doc(db, "users", credData.employeeId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;
    
    const profile = userSnap.data() as EmployeeProfile;
    cacheUserLocally(cleanEmail, password, profile);
    return profile;
  } catch (error: any) {
    console.warn("Firestore offline or unavailable during login:", error);
    // Offline resilience: check local storage cache
    const cached = getLocalUsersCache().find(u => u.email === cleanEmail && u.password === password);
    if (cached) {
      return cached.profile;
    }
    return null;
  }
}

export async function registerUser(
  profile: Omit<EmployeeProfile, "role">, 
  password: string, 
  role: "employee" | "admin" = "employee"
): Promise<EmployeeProfile | null> {
  const cleanEmail = profile.email.toLowerCase().trim();
  const fullProfile: EmployeeProfile = {
    ...profile,
    email: cleanEmail,
    role
  };

  try {
    const userWithEmailQuery = query(collection(db, "users"), where("email", "==", cleanEmail));
    const userWithEmailSnap = await getDocs(userWithEmailQuery);
    if (!userWithEmailSnap.empty) {
      throw new Error("Email already registered");
    }

    const userWithIdSnap = await getDoc(doc(db, "users", profile.employeeId));
    if (userWithIdSnap.exists()) {
      throw new Error("User ID already exists");
    }

    await setDoc(doc(db, "users", profile.employeeId), fullProfile);
    await setDoc(doc(db, "user_credentials", cleanEmail), {
      email: cleanEmail,
      password,
      employeeId: profile.employeeId
    });

    await logActivity(profile.employeeId, profile.name, "Register", `User registered with ID ${profile.employeeId} as ${role}`);
    cacheUserLocally(cleanEmail, password, fullProfile);

    return fullProfile;
  } catch (error: any) {
    console.error("Error registering user:", error);
    throw error;
  }
}

export async function registerEmployee(profile: Omit<EmployeeProfile, "role">, password: string): Promise<EmployeeProfile | null> {
  return registerUser(profile, password, "employee");
}


// Categories helper
export async function getCategories(): Promise<ExpenseCategory[]> {
  try {
    const snap = await getDocs(collection(db, "categories"));
    return snap.docs.map(d => d.data() as ExpenseCategory);
  } catch (error) {
    console.error("Error getting categories:", error);
    return [];
  }
}

export async function addCategory(name: string): Promise<ExpenseCategory | null> {
  try {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const docRef = doc(db, "categories", id);
    const category = { id, name };
    await setDoc(docRef, category);
    return category;
  } catch (error) {
    console.error("Error adding category:", error);
    return null;
  }
}

// Activity Logging Helper
export async function logActivity(userId: string, userName: string, action: string, details: string) {
  try {
    const log: Omit<AuditLog, "id"> = {
      userId,
      userName,
      action,
      details,
      timestamp: new Date().toISOString()
    };
    await addDoc(collection(db, "audit_logs"), log);
  } catch (error) {
    console.error("Error logging activity:", error);
  }
}

// Notification Helper
export async function createNotification(
  userId: string, 
  title: string, 
  message: string,
  expenseId?: string,
  voucherNumber?: string
) {
  try {
    const notif: Omit<AppNotification, "id"> = {
      userId,
      title,
      message,
      read: false,
      timestamp: new Date().toISOString(),
      ...(expenseId ? { expenseId } : {}),
      ...(voucherNumber ? { voucherNumber } : {})
    };
    await addDoc(collection(db, "notifications"), notif);
  } catch (error) {
    console.error("Error creating notification:", error);
  }
}

export async function addVoucherComment(
  expenseId: string,
  commentData: {
    senderId: string;
    senderName: string;
    senderRole: "admin" | "employee";
    message: string;
  }
): Promise<VoucherComment[]> {
  try {
    const ref = doc(db, "expenses", expenseId);
    const expSnap = await getDoc(ref);
    if (!expSnap.exists()) {
      throw new Error("Expense claim not found.");
    }

    const exp = expSnap.data() as Expense;
    const existingComments = exp.comments || [];

    const newComment: VoucherComment = {
      id: `CMT_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderId: commentData.senderId,
      senderName: commentData.senderName,
      senderRole: commentData.senderRole,
      message: commentData.message.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedComments = [...existingComments, newComment];

    await updateDoc(ref, {
      comments: updatedComments,
      ...(commentData.senderRole === "admin" && exp.status === "pending" ? { status: "under_review" } : {})
    });

    await logActivity(
      commentData.senderId,
      commentData.senderName,
      "Voucher Remark",
      `Posted remark on Voucher ${exp.voucherNumber || expenseId}: "${commentData.message.substring(0, 40)}..."`
    );

    // Send notification to recipient
    const vNum = exp.voucherNumber || "Voucher";
    if (commentData.senderRole === "admin") {
      // Notify employee who submitted the bill
      if (exp.employeeId) {
        await createNotification(
          exp.employeeId,
          `Remark on Voucher ${vNum}`,
          `${commentData.senderName}: "${commentData.message.substring(0, 80)}"`,
          expenseId,
          vNum
        );
      }
    } else {
      // Employee replied with clarification -> Notify all admins
      const adminsQuery = query(collection(db, "users"), where("role", "==", "admin"));
      const adminsSnap = await getDocs(adminsQuery);
      for (const adminDoc of adminsSnap.docs) {
        await createNotification(
          adminDoc.id,
          `Clarification on Voucher ${vNum}`,
          `${commentData.senderName}: "${commentData.message.substring(0, 80)}"`,
          expenseId,
          vNum
        );
      }
    }

    return updatedComments;
  } catch (error) {
    console.error("Error adding voucher comment:", error);
    throw error;
  }
}

export async function deleteVoucherComment(
  expenseId: string,
  commentId: string
): Promise<VoucherComment[]> {
  try {
    const ref = doc(db, "expenses", expenseId);
    const expSnap = await getDoc(ref);
    if (!expSnap.exists()) {
      throw new Error("Expense claim not found.");
    }

    const exp = expSnap.data() as Expense;
    const existingComments = exp.comments || [];
    const updatedComments = existingComments.filter(c => c.id !== commentId);

    await updateDoc(ref, {
      comments: updatedComments
    });

    return updatedComments;
  } catch (error) {
    console.error("Error deleting voucher comment:", error);
    throw error;
  }
}

export async function clearVoucherCommentsForMonth(
  expenseId: string,
  monthName?: string,
  yearStr?: string
): Promise<VoucherComment[]> {
  try {
    const ref = doc(db, "expenses", expenseId);
    const expSnap = await getDoc(ref);
    if (!expSnap.exists()) {
      throw new Error("Expense claim not found.");
    }

    const exp = expSnap.data() as Expense;
    const existingComments = exp.comments || [];
    let updatedComments: VoucherComment[] = [];

    if (monthName && monthName !== "All" && monthName !== "") {
      updatedComments = existingComments.filter(c => {
        if (!c.timestamp) return false;
        const cDate = new Date(c.timestamp);
        const cMonth = cDate.toLocaleString("default", { month: "long" });
        const cYear = cDate.getFullYear().toString();
        const matchesMonth = cMonth === monthName;
        const matchesYear = !yearStr || yearStr === "All" || yearStr === "" || cYear === yearStr;
        return !(matchesMonth && matchesYear);
      });
    }

    await updateDoc(ref, {
      comments: updatedComments
    });

    return updatedComments;
  } catch (error) {
    console.error("Error clearing voucher comments for month:", error);
    throw error;
  }
}

export async function getUserNotifications(userId: string): Promise<AppNotification[]> {
  try {
    const q = query(
      collection(db, "notifications"), 
      where("userId", "==", userId)
    );
    const snap = await getDocs(q);
    const notifications = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
    // Sort descending by timestamp locally
    return notifications.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (error) {
    console.error("Error getting notifications:", error);
    return [];
  }
}

export async function markNotificationAsRead(id: string) {
  try {
    await updateDoc(doc(db, "notifications", id), { read: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
  }
}

export async function markExpenseNotificationsAsRead(userId: string, expenseId?: string, voucherNumber?: string) {
  if (!userId || (!expenseId && !voucherNumber)) return;
  try {
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("read", "==", false)
    );
    const snap = await getDocs(q);
    const batchPromises = snap.docs
      .filter(d => {
        const notif = d.data() as AppNotification;
        const msg = `${notif.title || ''} ${notif.message || ''}`;
        const isExpIdMatch = Boolean(expenseId && (notif.expenseId === expenseId || msg.includes(expenseId)));
        const isVNumMatch = Boolean(voucherNumber && (notif.voucherNumber === voucherNumber || msg.includes(voucherNumber)));
        return isExpIdMatch || isVNumMatch;
      })
      .map(d => updateDoc(doc(db, "notifications", d.id), { read: true }));

    await Promise.all(batchPromises);
  } catch (error) {
    console.error("Error marking expense notifications as read:", error);
  }
}

// Duplicate bill detection helper
export async function checkForDuplicateBill(
  amount: number, 
  date: string, 
  category: string, 
  ignoredExpenseId?: string
): Promise<Expense | null> {
  try {
    // Queries database for expenses on the same date and category
    const q = query(
      collection(db, "expenses"),
      where("date", "==", date),
      where("category", "==", category)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const exp = { id: d.id, ...d.data() } as Expense;
      if (exp.id !== ignoredExpenseId && Math.abs(exp.amount - amount) < 0.01) {
        return exp;
      }
    }
    return null;
  } catch (error) {
    console.error("Error checking duplicate bills:", error);
    return null;
  }
}

// Chunk size: 700,000 characters (about 512KB base64, safe for Firestore 1MB limit including index/metadata)
const CHUNK_SIZE = 700000;

export async function saveBillChunks(expenseId: string, billId: string, fileData: string): Promise<void> {
  const totalChunks = Math.ceil(fileData.length / CHUNK_SIZE);
  for (let i = 0; i < totalChunks; i++) {
    const chunkData = fileData.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const chunkId = `chunk_${billId}_${i}`;
    await setDoc(doc(db, "bill_chunks", chunkId), {
      billId,
      expenseId,
      chunkIndex: i,
      totalChunks,
      chunkData
    });
  }
}

export async function getBillData(expenseId: string, billId: string): Promise<string> {
  try {
    // Check if there are chunks in the bill_chunks collection
    const q = query(
      collection(db, "bill_chunks"),
      where("billId", "==", billId),
      orderBy("chunkIndex", "asc")
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      // Reconstitute from chunks
      const chunks = snap.docs.map(d => d.data());
      // Re-sort locally to guarantee absolute order accuracy
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      return chunks.map(c => c.chunkData).join("");
    }
    
    // Fallback: check if the expense document itself has it (legacy offline/inline receipts)
    const expDoc = await getDoc(doc(db, "expenses", expenseId));
    if (expDoc.exists()) {
      const exp = expDoc.data() as Expense;
      const legacyBill = exp.bills?.find(b => b.id === billId);
      if (legacyBill && legacyBill.fileData) {
        return legacyBill.fileData;
      }
    }
    return "";
  } catch (error) {
    console.error("Error loading bill data:", error);
    return "";
  }
}

// Expense Crud
export async function resequenceVouchersForMonth(yearMonth: string): Promise<void> {
  try {
    const monthPart = yearMonth.split("-")[1] || "01";
    const expensesSnap = await getDocs(collection(db, "expenses"));
    const expensesInMonth = expensesSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as Expense))
      .filter(e => e.date && e.date.startsWith(yearMonth));

    // Sort chronologically: earliest date first. If dates are the same, sort by createdDate.
    expensesInMonth.sort((a, b) => {
      const dateComp = (a.date || "").localeCompare(b.date || "");
      if (dateComp !== 0) return dateComp;
      return (a.createdDate || "").localeCompare(b.createdDate || "");
    });

    // Update each expense sequentially
    for (let i = 0; i < expensesInMonth.length; i++) {
      const exp = expensesInMonth[i];
      const nextNumber = i + 1;
      const padNum = String(nextNumber).padStart(3, "0");
      const newVoucherNumber = `SW-${monthPart}-${padNum}`;

      // Update names of associated bills based on this voucher number
      const updatedBills = (exp.bills || []).map((b, idx) => {
        const originalFileName = b.fileName || "bill";
        const dotIndex = originalFileName.lastIndexOf(".");
        const ext = dotIndex !== -1 ? originalFileName.substring(dotIndex) : "";
        const newName = (exp.bills || []).length <= 1
          ? `${newVoucherNumber}${ext}`
          : `${newVoucherNumber}_${idx + 1}${ext}`;
        return {
          ...b,
          fileName: newName
        };
      });

      if (exp.voucherNumber !== newVoucherNumber) {
        await updateDoc(doc(db, "expenses", exp.id), { 
          voucherNumber: newVoucherNumber,
          bills: updatedBills
        });
      }
    }
  } catch (error) {
    console.error("Error resequencing vouchers:", error);
  }
}

export async function submitExpense(expenseData: Omit<Expense, "id" | "status" | "createdDate" | "adminComments">): Promise<Expense> {
  try {
    const date = expenseData.date; // e.g. "2026-07-11"
    const monthPart = date.split("-")[1] || "01";
    const yearMonth = date.substring(0, 7);

    // Initial placeholder voucher number
    const tempVoucherNumber = `SW-${monthPart}-TEMP`;

    // Keep actual file content separate from main document to maintain performance and avoid 1MB limit
    const billsWithData = expenseData.bills.map((b, idx) => {
      const originalFileName = b.fileName || "bill";
      const dotIndex = originalFileName.lastIndexOf(".");
      const ext = dotIndex !== -1 ? originalFileName.substring(dotIndex) : "";
      const newName = expenseData.bills.length <= 1
        ? `${tempVoucherNumber}${ext}`
        : `${tempVoucherNumber}_${idx + 1}${ext}`;
      return {
        ...b,
        fileName: newName
      };
    });

    const cleanBills = billsWithData.map(b => ({
      id: b.id,
      fileName: b.fileName,
      fileType: b.fileType,
      uploadDate: b.uploadDate,
      fileData: "" // Strip full content to fit in Firestore 1MB document limit
    }));

    const fullExpense: Omit<Expense, "id"> = {
      ...expenseData,
      bills: cleanBills,
      voucherNumber: tempVoucherNumber,
      status: "pending",
      createdDate: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, "expenses"), fullExpense);

    // Resequence the vouchers for this month so everything is perfectly sequential
    await resequenceVouchersForMonth(yearMonth);

    // Read back the updated document to get the correct voucher number and bill filenames
    const finalDocSnap = await getDoc(docRef);
    const finalData = finalDocSnap.data() as Expense;

    const finalBills = billsWithData.map(b => {
      const match = finalData.bills.find(fb => fb.id === b.id);
      return {
        ...b,
        fileName: match ? match.fileName : b.fileName
      };
    });

    const result: Expense = {
      id: docRef.id,
      ...finalData,
      bills: finalBills
    };

    // Save individual files to bill_chunks
    for (const bill of finalBills) {
      if (bill.fileData) {
        await saveBillChunks(docRef.id, bill.id, bill.fileData);
      }
    }

    await logActivity(
      expenseData.employeeId, 
      expenseData.employeeName, 
      "Submit Expense", 
      `Submitted expense: ${expenseData.title} for $${expenseData.totalAmount}`
    );

    // Notify Admins
    const adminsQuery = query(collection(db, "users"), where("role", "==", "admin"));
    const adminsSnap = await getDocs(adminsQuery);
    for (const adminDoc of adminsSnap.docs) {
      await createNotification(
        adminDoc.id, 
        "New Expense Submitted", 
        `${expenseData.employeeName} submitted an expense of ₹${expenseData.totalAmount} for ${expenseData.category}`,
        result.id,
        result.voucherNumber
      );
    }

    return result;
  } catch (error) {
    console.error("Error submitting expense:", error);
    throw error;
  }
}

export async function updateExpense(
  id: string, 
  expenseData: Partial<Expense>, 
  updaterUserId: string, 
  updaterName: string
): Promise<void> {
  try {
    const ref = doc(db, "expenses", id);
    
    // Clean undefined fields to prevent Firestore updateDoc error with undefined values
    const cleanData: Record<string, any> = {};
    Object.entries(expenseData).forEach(([key, val]) => {
      if (val !== undefined) {
        cleanData[key] = val;
      }
    });

    await updateDoc(ref, cleanData);
    
    await logActivity(
      updaterUserId, 
      updaterName, 
      "Update Expense", 
      `Updated expense ID: ${id}. Status changed to: ${expenseData.status || 'no change'}`
    );
  } catch (error) {
    console.error("Error updating expense:", error);
    throw error;
  }
}

export async function deleteExpense(id: string, employeeId: string, employeeName: string): Promise<void> {
  try {
    const ref = doc(db, "expenses", id);
    const expSnap = await getDoc(ref);
    let dateToUse = "";
    if (expSnap.exists()) {
      const data = expSnap.data() as Expense;
      dateToUse = data.date;
    }

    await deleteDoc(ref);

    // Also delete any bill chunks associated with this expense
    const q = query(collection(db, "bill_chunks"), where("expenseId", "==", id));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(doc(db, "bill_chunks", d.id));
    }

    // Resequence remaining vouchers in the same month
    if (dateToUse) {
      const yearMonth = dateToUse.substring(0, 7);
      await resequenceVouchersForMonth(yearMonth);
    }

    await logActivity(
      employeeId, 
      employeeName, 
      "Delete Expense", 
      `Deleted pending expense ID: ${id}`
    );
  } catch (error) {
    console.error("Error deleting expense:", error);
    throw error;
  }
}

export async function deleteBillAttachmentFromExpense(expenseId: string, billId: string, updaterUserId: string, updaterName: string): Promise<void> {
  try {
    const ref = doc(db, "expenses", expenseId);
    const expSnap = await getDoc(ref);
    if (!expSnap.exists()) return;

    const data = expSnap.data() as Expense;
    const updatedBills = (data.bills || []).filter(b => b.id !== billId);

    await updateDoc(ref, { bills: updatedBills });

    // Delete chunks for this specific bill
    const q = query(
      collection(db, "bill_chunks"), 
      where("expenseId", "==", expenseId),
      where("billId", "==", billId)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(doc(db, "bill_chunks", d.id));
    }

    await logActivity(
      updaterUserId,
      updaterName,
      "Delete Bill Attachment",
      `Deleted receipt attachment ID ${billId} from expense ${expenseId}`
    );
  } catch (error) {
    console.error("Error deleting bill attachment:", error);
    throw error;
  }
}


export async function getExpenses(): Promise<Expense[]> {
  try {
    const snap = await getDocs(collection(db, "expenses"));
    const expenses = snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
    
    // Group and check for out-of-order voucher numbers to trigger self-healing resequencing
    const groups: { [key: string]: Expense[] } = {};
    expenses.forEach(e => {
      if (e.date) {
        const ym = e.date.substring(0, 7);
        if (!groups[ym]) groups[ym] = [];
        groups[ym].push(e);
      }
    });

    let neededResequence = false;
    for (const ym of Object.keys(groups)) {
      const list = groups[ym];
      // Sort chronologically (earliest first)
      list.sort((a, b) => {
        const dateComp = (a.date || "").localeCompare(b.date || "");
        if (dateComp !== 0) return dateComp;
        return (a.createdDate || "").localeCompare(b.createdDate || "");
      });

      // Check if voucher numbers are perfectly SW-MM-001, SW-MM-002, ...
      const monthPart = ym.split("-")[1] || "01";
      let match = true;
      for (let i = 0; i < list.length; i++) {
        const expected = `SW-${monthPart}-${String(i + 1).padStart(3, "0")}`;
        if (list[i].voucherNumber !== expected) {
          match = false;
          break;
        }
      }
      if (!match) {
        neededResequence = true;
        await resequenceVouchersForMonth(ym);
      }
    }

    let finalExpenses = expenses;
    if (neededResequence) {
      const freshSnap = await getDocs(collection(db, "expenses"));
      finalExpenses = freshSnap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
    }

    // Sort ascending by YearMonth, then ascending by voucher sequence suffix
    finalExpenses.sort((a, b) => {
      const ymA = (a.date || "").substring(0, 7);
      const ymB = (b.date || "").substring(0, 7);
      if (ymA !== ymB) {
        return ymA.localeCompare(ymB);
      }
      const vA = a.voucherNumber || "";
      const vB = b.voucherNumber || "";
      const suffixA = vA ? parseInt(vA.split("-")[2], 10) : 0;
      const suffixB = vB ? parseInt(vB.split("-")[2], 10) : 0;
      if (!isNaN(suffixA) && !isNaN(suffixB)) {
        return suffixA - suffixB;
      }
      return vA.localeCompare(vB);
    });

    return finalExpenses;
  } catch (error) {
    console.error("Error getting expenses:", error);
    return [];
  }
}

export async function getExpensesByEmployee(employeeId: string): Promise<Expense[]> {
  try {
    const q = query(collection(db, "expenses"), where("employeeId", "==", employeeId));
    const snap = await getDocs(q);
    const expenses = snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
    
    // Sort ascending by YearMonth, then ascending by voucher sequence suffix
    expenses.sort((a, b) => {
      const ymA = (a.date || "").substring(0, 7);
      const ymB = (b.date || "").substring(0, 7);
      if (ymA !== ymB) {
        return ymA.localeCompare(ymB);
      }
      const vA = a.voucherNumber || "";
      const vB = b.voucherNumber || "";
      const suffixA = vA ? parseInt(vA.split("-")[2], 10) : 0;
      const suffixB = vB ? parseInt(vB.split("-")[2], 10) : 0;
      if (!isNaN(suffixA) && !isNaN(suffixB)) {
        return suffixA - suffixB;
      }
      return vA.localeCompare(vB);
    });

    return expenses;
  } catch (error) {
    console.error("Error getting employee expenses:", error);
    return [];
  }
}

/**
 * Real-time listener for all expenses (used by Admin and shared views)
 */
export function subscribeToExpenses(callback: (expenses: Expense[]) => void): () => void {
  const colRef = collection(db, "expenses");
  return onSnapshot(colRef, (snap) => {
    const expenses = snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
    
    // Sort ascending by YearMonth, then ascending by voucher sequence suffix
    expenses.sort((a, b) => {
      const ymA = (a.date || "").substring(0, 7);
      const ymB = (b.date || "").substring(0, 7);
      if (ymA !== ymB) {
        return ymA.localeCompare(ymB);
      }
      const vA = a.voucherNumber || "";
      const vB = b.voucherNumber || "";
      const suffixA = vA ? parseInt(vA.split("-")[2], 10) : 0;
      const suffixB = vB ? parseInt(vB.split("-")[2], 10) : 0;
      if (!isNaN(suffixA) && !isNaN(suffixB)) {
        return suffixA - suffixB;
      }
      return vA.localeCompare(vB);
    });

    callback(expenses);
  }, (error) => {
    console.error("Error subscribing to real-time expenses:", error);
  });
}

/**
 * Real-time listener for expenses submitted by a specific employee
 */
export function subscribeToExpensesByEmployee(employeeId: string, callback: (expenses: Expense[]) => void): () => void {
  const q = query(collection(db, "expenses"), where("employeeId", "==", employeeId));
  return onSnapshot(q, (snap) => {
    const expenses = snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
    
    expenses.sort((a, b) => {
      const ymA = (a.date || "").substring(0, 7);
      const ymB = (b.date || "").substring(0, 7);
      if (ymA !== ymB) {
        return ymA.localeCompare(ymB);
      }
      const vA = a.voucherNumber || "";
      const vB = b.voucherNumber || "";
      const suffixA = vA ? parseInt(vA.split("-")[2], 10) : 0;
      const suffixB = vB ? parseInt(vB.split("-")[2], 10) : 0;
      if (!isNaN(suffixA) && !isNaN(suffixB)) {
        return suffixA - suffixB;
      }
      return vA.localeCompare(vB);
    });

    callback(expenses);
  }, (error) => {
    console.error("Error subscribing to employee expenses:", error);
  });
}


export async function getEmployees(): Promise<EmployeeProfile[]> {
  try {
    const snap = await getDocs(collection(db, "users"));
    const list = snap.docs.map(d => d.data() as EmployeeProfile);
    
    const seen = new Set<string>();
    const uniqueList: EmployeeProfile[] = [];
    for (const emp of list) {
      if (emp.employeeId) {
        const idKey = emp.employeeId.trim().toLowerCase();
        if (!seen.has(idKey)) {
          seen.add(idKey);
          uniqueList.push(emp);
        }
      }
    }
    return uniqueList;
  } catch (error) {
    console.error("Error getting employees:", error);
    return [];
  }
}

export async function updateEmployeeProfile(employeeId: string, profileData: Partial<EmployeeProfile>): Promise<void> {
  try {
    const ref = doc(db, "users", employeeId);
    await updateDoc(ref, profileData);
  } catch (error) {
    console.error("Error updating employee profile:", error);
    throw error;
  }
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  try {
    const snap = await getDocs(collection(db, "audit_logs"));
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
    return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (error) {
    console.error("Error getting audit logs:", error);
    return [];
  }
}

export async function toggleEmployeeAdminRole(targetEmployeeId: string, currentAdminEmail: string): Promise<boolean> {
  try {
    const userRef = doc(db, "users", targetEmployeeId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return false;
    
    const userData = userSnap.data() as EmployeeProfile;
    const newRole = userData.role === "admin" ? "employee" : "admin";
    
    await updateDoc(userRef, { role: newRole });
    await logActivity(
      targetEmployeeId,
      userData.name,
      newRole === "admin" ? "Promote Admin" : "Demote Admin",
      `Changed role of employee ${userData.name} (${targetEmployeeId}) to ${newRole} by ${currentAdminEmail}`
    );
    return true;
  } catch (error) {
    console.error("Error toggling admin role:", error);
    throw error;
  }
}

export async function deleteEmployeeProfile(
  targetEmployeeId: string, 
  adminUserId: string, 
  adminName: string,
  deleteExpenses: boolean = false
): Promise<boolean> {
  try {
    if (targetEmployeeId === adminUserId) {
      throw new Error("You cannot delete your own account while logged in.");
    }

    const userRef = doc(db, "users", targetEmployeeId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return false;
    
    const userData = userSnap.data() as EmployeeProfile;

    
    await deleteDoc(userRef);
    
    let expensesDeletedCount = 0;
    if (deleteExpenses) {
      const q = query(collection(db, "expenses"), where("employeeId", "==", targetEmployeeId));
      const snap = await getDocs(q);
      const batchPromises = snap.docs.map(d => deleteDoc(doc(db, "expenses", d.id)));
      await Promise.all(batchPromises);
      expensesDeletedCount = snap.docs.length;
    }
    
    await logActivity(
      adminUserId,
      adminName,
      "Delete Employee",
      `Deleted employee ${userData.name} (${targetEmployeeId}) profile.${deleteExpenses ? ` Also deleted ${expensesDeletedCount} associated expense claims.` : ""}`
    );
    return true;
  } catch (error) {
    console.error("Error deleting employee profile:", error);
    throw error;
  }
}

