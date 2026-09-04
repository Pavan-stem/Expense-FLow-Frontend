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
  writeBatch,
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
const dbId = firebaseConfig.firestoreDatabaseId?.trim();
export const db = (dbId && dbId !== "(default)")
  ? getFirestore(app, dbId)
  : getFirestore(app);

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
  status?: "active" | "deactivated";
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

export interface AdvancePayment {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail?: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  paymentMethod: string; // "Bank Transfer" | "UPI" | "Cash" | "Cheque" | "Company Card" | string;
  purpose: string;
  referenceNumber?: string;
  status: "active" | "cancelled";
  createdBy: string;
  createdByName: string;
  createdAt: string;
  notes?: string;
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
  paymentMethod: "Personal Payment" | "SW Payment" | "Advance Payment" | "Cash" | "UPI" | "UPI+Cash" | "Credit Card" | "Debit Card" | "Bank Transfer" | string;
  paymentSource?: "advance" | "company" | "personal_reimbursement";
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
 * Check if a payment method corresponds to SW Payment (company paid directly or via advance).
 * SW Payments are not out-of-pocket expenses and should never be reimbursed to the employee.
 */
export function isSwPaymentMethod(method?: string, source?: string): boolean {
  if (source === "advance" || source === "company") return true;
  if (!method) return false;
  const m = method.trim();
  if (m.includes("SW Payment")) return true;
  if (m.includes("Advance")) return true;
  if (m === "Bank Transfer" || m === "Credit Card") return true;
  return false;
}

/**
 * Check if a payment method/source corresponds to Advance Payment (paid using company advance).
 */
export function isAdvancePaymentMethod(method?: string, source?: string): boolean {
  if (source === "advance") return true;
  if (!method) return false;
  return method.trim().includes("Advance");
}

/**
 * Check if a payment method corresponds to Personal Payment (paid by employee out-of-pocket).
 * Advance payments and SW company payments are excluded.
 */
export function isPersonalPaymentMethod(method?: string, source?: string): boolean {
  if (source === "personal_reimbursement") return true;
  if (source === "company" || source === "advance") return false;
  if (isAdvancePaymentMethod(method, source)) return false;
  return !isSwPaymentMethod(method, source);
}

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
  const batch = writeBatch(db);
  for (let i = 0; i < totalChunks; i++) {
    const chunkData = fileData.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const chunkId = `chunk_${billId}_${i}`;
    batch.set(doc(db, "bill_chunks", chunkId), {
      billId,
      expenseId,
      chunkIndex: i,
      totalChunks,
      chunkData
    });
  }
  await batch.commit();
}

export async function getBillData(expenseId: string, billId: string): Promise<string> {
  try {
    // Strategy 1: Direct chunk ID lookup (fastest — no index needed)
    // Chunks are saved with predictable IDs: chunk_${billId}_${i}
    // Try fetching chunk_0 to discover totalChunks, then load the rest
    const chunk0Ref = doc(db, "bill_chunks", `chunk_${billId}_0`);
    const chunk0Snap = await getDoc(chunk0Ref);
    if (chunk0Snap.exists()) {
      const chunk0Data = chunk0Snap.data();
      const totalChunks: number = chunk0Data.totalChunks || 1;
      if (totalChunks === 1) {
        return chunk0Data.chunkData as string;
      }
      // Fetch remaining chunks in parallel
      const remainingRefs = Array.from({ length: totalChunks - 1 }, (_, i) =>
        getDoc(doc(db, "bill_chunks", `chunk_${billId}_${i + 1}`))
      );
      const remainingSnaps = await Promise.all(remainingRefs);
      const allChunks = [chunk0Data, ...remainingSnaps.map(s => s.data())].filter(Boolean);
      allChunks.sort((a, b) => (a!.chunkIndex as number) - (b!.chunkIndex as number));
      return allChunks.map(c => c!.chunkData as string).join("");
    }

    // Strategy 2: Query by billId only (no orderBy — avoids composite index requirement)
    const q = query(
      collection(db, "bill_chunks"),
      where("billId", "==", billId)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      // Sort client-side — no Firestore composite index needed
      const chunks = snap.docs.map(d => d.data());
      chunks.sort((a, b) => (a.chunkIndex as number) - (b.chunkIndex as number));
      return chunks.map(c => c.chunkData as string).join("");
    }

    // Strategy 3: Fallback for legacy expenses where fileData was stored inline
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
    // Last-resort fallback: try querying without orderBy in case of index error
    try {
      const q = query(
        collection(db, "bill_chunks"),
        where("billId", "==", billId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const chunks = snap.docs.map(d => d.data());
        chunks.sort((a, b) => (a.chunkIndex as number) - (b.chunkIndex as number));
        return chunks.map(c => c.chunkData as string).join("");
      }
    } catch (fallbackError) {
      console.error("Fallback bill data load also failed:", fallbackError);
    }
    return "";
  }
}

// Expense Crud
export async function resequenceVouchersForMonth(yearMonth: string): Promise<void> {
  try {
    const monthPart = yearMonth.split("-")[1] || "01";
    // Target only expenses belonging to this specific month using range queries
    const startOfMonth = `${yearMonth}-01`;
    const endOfMonth = `${yearMonth}-31\uf8ff`;
    const q = query(
      collection(db, "expenses"),
      where("date", ">=", startOfMonth),
      where("date", "<=", endOfMonth)
    );
    const snap = await getDocs(q);
    const expensesInMonth = snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));

    if (expensesInMonth.length === 0) return;

    // Sort chronologically: earliest date first. If dates are the same, sort by createdDate.
    expensesInMonth.sort((a, b) => {
      const dateComp = (a.date || "").localeCompare(b.date || "");
      if (dateComp !== 0) return dateComp;
      return (a.createdDate || "").localeCompare(b.createdDate || "");
    });

    const batch = writeBatch(db);
    let hasUpdates = false;

    for (let i = 0; i < expensesInMonth.length; i++) {
      const exp = expensesInMonth[i];
      const nextNumber = i + 1;
      const padNum = String(nextNumber).padStart(3, "0");
      const newVoucherNumber = `SW-${monthPart}-${padNum}`;

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
        batch.update(doc(db, "expenses", exp.id), {
          voucherNumber: newVoucherNumber,
          bills: updatedBills
        });
        hasUpdates = true;
      }
    }

    if (hasUpdates) {
      await batch.commit();
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

export async function updateExpenseWithBills(
  expenseId: string,
  updatedData: Partial<Expense>,
  newBills: BillFile[],
  removedBillIds: string[],
  updaterUserId: string,
  updaterName: string,
  updaterRole: "admin" | "employee"
): Promise<void> {
  try {
    const ref = doc(db, "expenses", expenseId);
    const expSnap = await getDoc(ref);
    if (!expSnap.exists()) {
      throw new Error("Expense record not found.");
    }
    const oldExpense = expSnap.data() as Expense;
    const oldDate = oldExpense.date;

    // 1. Delete removed bill chunks in parallel
    if (removedBillIds.length > 0) {
      const deletePromises = removedBillIds.map(async (billId) => {
        const q = query(
          collection(db, "bill_chunks"),
          where("expenseId", "==", expenseId),
          where("billId", "==", billId)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const batch = writeBatch(db);
          snap.docs.forEach(d => batch.delete(doc(db, "bill_chunks", d.id)));
          await batch.commit();
        }
      });
      await Promise.all(deletePromises);
    }

    // 2. Save chunks for new bills in parallel and build clean bill metadata
    const cleanNewBills: BillFile[] = [];
    if (newBills.length > 0) {
      await Promise.all(
        newBills.map(async (bill) => {
          if (bill.fileData) {
            await saveBillChunks(expenseId, bill.id, bill.fileData);
          }
          cleanNewBills.push({
            ...bill,
            fileData: "" // strip data URL before updating main doc
          });
        })
      );
    }

    // 3. Assemble combined bill metadata
    const existingBills = (oldExpense.bills || []).filter(b => !removedBillIds.includes(b.id));
    const combinedBills = [...existingBills, ...cleanNewBills];

    // 4. Build clean data for updateDoc
    const payload: Partial<Expense> = {
      ...updatedData,
      bills: combinedBills
    };

    const cleanData: Record<string, any> = {};
    Object.entries(payload).forEach(([key, val]) => {
      if (val !== undefined) {
        cleanData[key] = val;
      }
    });

    await updateDoc(ref, cleanData);

    // 5. Resequence vouchers if date changed or to update filenames (asynchronous background execution)
    const newDate = updatedData.date || oldDate;
    if (oldDate && oldDate.substring(0, 7) !== (newDate && newDate.substring(0, 7))) {
      resequenceVouchersForMonth(oldDate.substring(0, 7)).catch(console.error);
    }
    if (newDate) {
      resequenceVouchersForMonth(newDate.substring(0, 7)).catch(console.error);
    }

    // 6. Log activity (async)
    logActivity(
      updaterUserId,
      updaterName,
      `${updaterRole === "admin" ? "Admin" : "Employee"} Updated Expense`,
      `Updated expense ID: ${expenseId} (${oldExpense.voucherNumber || "N/A"})`
    ).catch(console.error);

    // 7. Notifications (async)
    if (updaterRole === "admin" && oldExpense.employeeId !== updaterUserId) {
      createNotification(
        oldExpense.employeeId,
        "Expense Claim Updated by Admin",
        `Admin ${updaterName} updated details for your expense claim (${oldExpense.voucherNumber || oldExpense.title}).`,
        expenseId,
        oldExpense.voucherNumber
      ).catch(console.error);
    } else if (updaterRole === "employee") {
      (async () => {
        const adminsQuery = query(collection(db, "users"), where("role", "==", "admin"));
        const adminsSnap = await getDocs(adminsQuery);
        for (const adminDoc of adminsSnap.docs) {
          await createNotification(
            adminDoc.id,
            "Expense Claim Updated by Employee",
            `${updaterName} updated expense claim (${oldExpense.voucherNumber || oldExpense.title}).`,
            expenseId,
            oldExpense.voucherNumber
          );
        }
      })().catch(console.error);
    }
  } catch (error) {
    console.error("Error updating expense with bills:", error);
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

    const batch = writeBatch(db);
    batch.delete(ref);

    // Fetch bill_chunks to delete in single batch
    const q = query(collection(db, "bill_chunks"), where("expenseId", "==", id));
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      batch.delete(doc(db, "bill_chunks", d.id));
    });

    await batch.commit();

    // Resequence remaining vouchers in background
    if (dateToUse) {
      const yearMonth = dateToUse.substring(0, 7);
      resequenceVouchersForMonth(yearMonth).catch(console.error);
    }

    logActivity(
      employeeId,
      employeeName,
      "Delete Expense",
      `Deleted pending expense ID: ${id}`
    ).catch(console.error);
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

    const batch = writeBatch(db);
    batch.update(ref, { bills: updatedBills });

    // Delete chunks for this specific bill in same batch
    const q = query(
      collection(db, "bill_chunks"),
      where("expenseId", "==", expenseId),
      where("billId", "==", billId)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      batch.delete(doc(db, "bill_chunks", d.id));
    });

    await batch.commit();

    logActivity(
      updaterUserId,
      updaterName,
      "Delete Bill Attachment",
      `Deleted receipt attachment ID ${billId} from expense ${expenseId}`
    ).catch(console.error);
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

export async function toggleEmployeeAccountStatus(
  targetEmployeeId: string,
  adminUserId: string,
  adminName: string
): Promise<"active" | "deactivated"> {
  try {
    const userRef = doc(db, "users", targetEmployeeId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error("Employee not found.");

    const userData = userSnap.data() as EmployeeProfile;
    const newStatus: "active" | "deactivated" = userData.status === "deactivated" ? "active" : "deactivated";

    await updateDoc(userRef, { status: newStatus });
    await logActivity(
      adminUserId,
      adminName,
      newStatus === "deactivated" ? "Deactivate Employee" : "Reactivate Employee",
      `Changed status of employee ${userData.name} (${targetEmployeeId}) to ${newStatus}`
    );
    return newStatus;
  } catch (error) {
    console.error("Error toggling employee account status:", error);
    throw error;
  }
}

export async function markEmployeeExpensesAsReimbursed(
  employeeId: string,
  adminUserId: string,
  adminName: string
): Promise<number> {
  try {
    const q = query(
      collection(db, "expenses"),
      where("employeeId", "==", employeeId)
    );
    const snap = await getDocs(q);
    const eligibleDocs = snap.docs.filter(d => {
      const data = d.data() as Expense;
      const isPersonal = isPersonalPaymentMethod(data.paymentMethod);
      return isPersonal && data.status === "approved";
    });

    if (eligibleDocs.length === 0) return 0;

    const updatePromises = eligibleDocs.map(d =>
      updateDoc(doc(db, "expenses", d.id), { status: "reimbursed" })
    );
    await Promise.all(updatePromises);

    await logActivity(
      adminUserId,
      adminName,
      "Mark Reimbursed",
      `Reimbursed ${eligibleDocs.length} personal claim(s) for employee ID ${employeeId}`
    );

    return eligibleDocs.length;
  } catch (error) {
    console.error("Error marking expenses as reimbursed:", error);
    throw error;
  }
}

export async function markAllEmployeesExpensesAsReimbursed(
  adminUserId: string,
  adminName: string
): Promise<number> {
  try {
    const snap = await getDocs(collection(db, "expenses"));
    const eligibleDocs = snap.docs.filter(d => {
      const data = d.data() as Expense;
      const isPersonal = isPersonalPaymentMethod(data.paymentMethod);
      return isPersonal && data.status === "approved";
    });

    if (eligibleDocs.length === 0) return 0;

    const updatePromises = eligibleDocs.map(d =>
      updateDoc(doc(db, "expenses", d.id), { status: "reimbursed" })
    );
    await Promise.all(updatePromises);

    await logActivity(
      adminUserId,
      adminName,
      "Mark All Reimbursed",
      `Reimbursed ${eligibleDocs.length} personal claim(s) across all employees`
    );

    return eligibleDocs.length;
  } catch (error) {
    console.error("Error marking all expenses as reimbursed:", error);
    throw error;
  }
}

export async function unmarkEmployeeExpensesAsReimbursed(
  employeeId: string,
  adminUserId: string,
  adminName: string
): Promise<number> {
  try {
    const q = query(
      collection(db, "expenses"),
      where("employeeId", "==", employeeId)
    );
    const snap = await getDocs(q);
    const eligibleDocs = snap.docs.filter(d => {
      const data = d.data() as Expense;
      return data.status === "reimbursed";
    });

    if (eligibleDocs.length === 0) return 0;

    const updatePromises = eligibleDocs.map(d =>
      updateDoc(doc(db, "expenses", d.id), { status: "approved" })
    );
    await Promise.all(updatePromises);

    await logActivity(
      adminUserId,
      adminName,
      "Reverse Reimbursed",
      `Reversed ${eligibleDocs.length} reimbursed claim(s) back to approved for employee ID ${employeeId}`
    );

    return eligibleDocs.length;
  } catch (error) {
    console.error("Error reversing reimbursed expenses:", error);
    throw error;
  }
}

export async function unmarkAllEmployeesExpensesAsReimbursed(
  adminUserId: string,
  adminName: string
): Promise<number> {
  try {
    const snap = await getDocs(collection(db, "expenses"));
    const eligibleDocs = snap.docs.filter(d => {
      const data = d.data() as Expense;
      return data.status === "reimbursed";
    });

    if (eligibleDocs.length === 0) return 0;

    const updatePromises = eligibleDocs.map(d =>
      updateDoc(doc(db, "expenses", d.id), { status: "approved" })
    );
    await Promise.all(updatePromises);

    await logActivity(
      adminUserId,
      adminName,
      "Reverse All Reimbursed",
      `Reversed ${eligibleDocs.length} reimbursed claim(s) back to approved across all employees`
    );

    return eligibleDocs.length;
  } catch (error) {
    console.error("Error reversing all reimbursed expenses:", error);
    throw error;
  }
}

// ==========================================
// EMPLOYEE ADVANCE PAYMENT MANAGEMENT
// ==========================================

/**
 * Record a new advance payment to an employee by Admin.
 */
export async function createAdvancePayment(advanceData: Omit<AdvancePayment, "id" | "createdAt" | "status">): Promise<string> {
  try {
    const dataToSave: Record<string, any> = {
      employeeId: advanceData.employeeId || "",
      employeeName: advanceData.employeeName || "",
      employeeEmail: advanceData.employeeEmail || "",
      amount: Number(advanceData.amount) || 0,
      paymentDate: advanceData.paymentDate || new Date().toISOString().split("T")[0],
      paymentMethod: advanceData.paymentMethod || "Bank Transfer",
      purpose: advanceData.purpose || "",
      referenceNumber: advanceData.referenceNumber ? advanceData.referenceNumber.trim() : "",
      status: "active",
      createdBy: advanceData.createdBy || "",
      createdByName: advanceData.createdByName || "",
      createdAt: new Date().toISOString()
    };

    if (advanceData.notes) {
      dataToSave.notes = advanceData.notes;
    }

    const docRef = await addDoc(collection(db, "advances"), dataToSave);

    await logActivity(
      advanceData.createdBy,
      advanceData.createdByName,
      "Pay Advance",
      `Disbursed advance of ₹${advanceData.amount} to ${advanceData.employeeName} via ${advanceData.paymentMethod} (Purpose: ${advanceData.purpose})`
    );

    // Notify employee of advance payment
    if (advanceData.employeeId) {
      await createNotification(
        advanceData.employeeId,
        "Advance Payment Received",
        `An advance payment of ₹${advanceData.amount} has been credited to your advance balance by ${advanceData.createdByName}. Purpose: ${advanceData.purpose}`
      );
    }

    return docRef.id;
  } catch (error) {
    console.error("Error creating advance payment:", error);
    throw error;
  }
}

/**
 * Retrieve all advance payments.
 */
export async function getAdvances(): Promise<AdvancePayment[]> {
  try {
    const snap = await getDocs(collection(db, "advances"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AdvancePayment));
  } catch (error) {
    console.error("Error fetching advances:", error);
    return [];
  }
}

/**
 * Retrieve advances for a specific employee.
 */
export async function getAdvancesByEmployee(employeeId: string): Promise<AdvancePayment[]> {
  try {
    const q = query(
      collection(db, "advances"),
      where("employeeId", "==", employeeId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AdvancePayment));
  } catch (error) {
    console.error("Error fetching employee advances:", error);
    return [];
  }
}

/**
 * Real-time subscription to all advance payments.
 */
export function subscribeToAdvances(callback: (advances: AdvancePayment[]) => void): () => void {
  const colRef = collection(db, "advances");
  return onSnapshot(colRef, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AdvancePayment));
    // Sort client-side by paymentDate descending
    list.sort((a, b) => (b.paymentDate || b.createdAt || "").localeCompare(a.paymentDate || a.createdAt || ""));
    callback(list);
  }, (err) => {
    console.error("Advance subscription error:", err);
  });
}

/**
 * Real-time subscription to advances for a specific employee.
 */
export function subscribeToAdvancesByEmployee(
  employeeId: string,
  callback: (advances: AdvancePayment[]) => void
): () => void {
  const q = query(
    collection(db, "advances"),
    where("employeeId", "==", employeeId)
  );
  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AdvancePayment));
    list.sort((a, b) => (b.paymentDate || b.createdAt || "").localeCompare(a.paymentDate || a.createdAt || ""));
    callback(list);
  }, (err) => {
    console.error("Employee advance subscription error:", err);
  });
}

/**
 * Cancel / reverse an advance payment if entered mistakenly.
 */
export async function cancelAdvancePayment(
  advanceId: string,
  adminUserId: string,
  adminName: string,
  reason?: string
): Promise<void> {
  try {
    const docRef = doc(db, "advances", advanceId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error("Advance payment record not found.");
    }
    const data = snap.data() as AdvancePayment;
    await updateDoc(docRef, {
      status: "cancelled",
      cancelledBy: adminUserId,
      cancelledByName: adminName,
      cancelledAt: new Date().toISOString(),
      cancelReason: reason || "Cancelled by admin"
    });

    await logActivity(
      adminUserId,
      adminName,
      "Cancel Advance",
      `Cancelled advance ID ${advanceId} of ₹${data.amount} for ${data.employeeName}. Reason: ${reason || "N/A"}`
    );
  } catch (error) {
    console.error("Error cancelling advance payment:", error);
    throw error;
  }
}

/**
 * Match helper to verify if an expense belongs to a given employee.
 */
function isExpenseOfEmployee(exp: Expense, employeeId: string, employeeEmail?: string, employeeName?: string): boolean {
  if (employeeId && exp.employeeId && exp.employeeId.toLowerCase().trim() === employeeId.toLowerCase().trim()) return true;
  if (employeeEmail && exp.employeeEmail && exp.employeeEmail.toLowerCase().trim() === employeeEmail.toLowerCase().trim()) return true;
  if (employeeName && exp.employeeName && exp.employeeName.toLowerCase().trim() === employeeName.toLowerCase().trim()) return true;
  return false;
}

/**
 * Compute the Advance Summary and Available Balance for an employee.
 * Logic:
 *  totalAdvance = SUM(all active advance payments for employee)
 *  totalUsed = SUM(all approved/reimbursed expenses where paymentSource === "advance" or paymentMethod includes "Advance Payment")
 *  availableBalance = Math.max(0, totalAdvance - totalUsed)
 *  pendingAdvanceAmount = SUM(all pending/under_review advance expenses)
 */
export function calculateAdvanceSummary(
  employeeId: string,
  advances: AdvancePayment[],
  expenses: Expense[],
  employeeEmail?: string,
  employeeName?: string
): {
  totalAdvance: number;
  totalUsed: number;
  approvedUsed?: number;
  availableBalance: number;
  pendingAdvanceAmount: number;
  activeAdvanceCount: number;
  submittedClaimsCount?: number;
  approvedClaimsCount: number;
  pendingClaimsCount: number;
} {
  // 1. Filter active advances for this employee
  const employeeAdvances = advances.filter(adv => {
    if (adv.status === "cancelled") return false;
    if (adv.employeeId && employeeId && adv.employeeId.toLowerCase().trim() === employeeId.toLowerCase().trim()) return true;
    if (adv.employeeEmail && employeeEmail && adv.employeeEmail.toLowerCase().trim() === employeeEmail.toLowerCase().trim()) return true;
    if (adv.employeeName && employeeName && adv.employeeName.toLowerCase().trim() === employeeName.toLowerCase().trim()) return true;
    return false;
  });

  const totalAdvance = employeeAdvances.reduce((sum, adv) => sum + (Number(adv.amount) || 0), 0);

  // 2. Filter advance expenses for this employee
  const employeeAdvanceExpenses = expenses.filter(exp => {
    if (!isExpenseOfEmployee(exp, employeeId, employeeEmail, employeeName)) return false;
    return isAdvancePaymentMethod(exp.paymentMethod, exp.paymentSource);
  });

  // When a bill is submitted using advance, it immediately decreases the available advance balance
  // Only rejected claims are excluded (their amount is restored back to the advance balance)
  const submittedClaims = employeeAdvanceExpenses.filter(e => e.status !== "rejected");
  const totalUsed = submittedClaims.reduce((sum, e) => sum + (Number(e.totalAmount || e.amount) || 0), 0);

  const approvedClaims = employeeAdvanceExpenses.filter(e => e.status === "approved" || e.status === "reimbursed");
  const approvedUsed = approvedClaims.reduce((sum, e) => sum + (Number(e.totalAmount || e.amount) || 0), 0);

  const pendingClaims = employeeAdvanceExpenses.filter(e => e.status === "pending" || e.status === "under_review");
  const pendingAdvanceAmount = pendingClaims.reduce((sum, e) => sum + (Number(e.totalAmount || e.amount) || 0), 0);

  const availableBalance = Math.max(0, totalAdvance - totalUsed);

  return {
    totalAdvance,
    totalUsed,
    approvedUsed,
    availableBalance,
    pendingAdvanceAmount,
    activeAdvanceCount: employeeAdvances.length,
    submittedClaimsCount: submittedClaims.length,
    approvedClaimsCount: approvedClaims.length,
    pendingClaimsCount: pendingClaims.length
  };
}

