import { useState, useEffect } from "react";
import { seedDatabaseIfNeeded, markAllUserNotificationsAsRead, type EmployeeProfile } from "./lib/firebase";
import Login from "./components/Login";
import Navbar from "./components/Navbar";
import Sidebar, { type SidebarTab } from "./components/Sidebar";
import EmployeeDashboard from "./components/EmployeeDashboard";
import AdminDashboard from "./components/AdminDashboard";
import VerifierDashboard from "./components/VerifierDashboard";
import ExpenseForm from "./components/ExpenseForm";
import ExpenseList from "./components/ExpenseList";
import ProfileView from "./components/ProfileView";
import AnalyticsHub from "./components/AnalyticsHub";
import Reports from "./components/Reports";
import BillDocumentHub from "./components/BillDocumentHub";
import AdvanceManagement from "./components/AdvanceManagement";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [currentUser, setCurrentUser] = useState<EmployeeProfile | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("dashboard");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [targetExpenseId, setTargetExpenseId] = useState<string | null>(null);

  // Auto-mark notifications as read when respective tabs are opened
  useEffect(() => {
    if (!currentUser?.employeeId) return;

    if (currentUser.role === "employee" && activeTab === "expenses") {
      markAllUserNotificationsAsRead(currentUser.employeeId);
    } else if (currentUser.role === "verifier" && activeTab === "expenses") {
      markAllUserNotificationsAsRead(currentUser.employeeId);
    } else if (currentUser.role === "admin" && (activeTab === "expenses" || activeTab === "dashboard")) {
      markAllUserNotificationsAsRead(currentUser.employeeId);
    }
  }, [activeTab, currentUser?.employeeId, currentUser?.role]);

  // Database auto-seeding on mount
  useEffect(() => {
    const initDb = async () => {
      await seedDatabaseIfNeeded();
    };
    initDb();

    // Clean stale cached employees/users if any exist
    try {
      localStorage.removeItem("ef_cached_employees");
      const rawCachedUsers = localStorage.getItem("ef_cached_users");
      if (rawCachedUsers) {
        const parsed = JSON.parse(rawCachedUsers);
        const filtered = parsed.filter((u: any) => 
          u.email !== "stem.admin@gmail.com" && 
          u.profile?.email !== "stem.admin@gmail.com" &&
          u.profile?.employeeId !== "ADM_STEM"
        );
        localStorage.setItem("ef_cached_users", JSON.stringify(filtered));
      }
    } catch {}

    // Recover login session from localStorage
    const savedUser = localStorage.getItem("expense_flow_user");
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to recover login session:", e);
      }
    }
  }, []);

  const handleLoginSuccess = (user: EmployeeProfile) => {
    setCurrentUser(user);
    localStorage.setItem("expense_flow_user", JSON.stringify(user));
    setActiveTab("dashboard");
    // Keep URL in sync with the user's role portal
    if (user.role === "admin" && window.location.pathname !== "/admin") {
      window.history.replaceState({}, "", "/admin");
    } else if (user.role === "verifier" && window.location.pathname !== "/verifier") {
      window.history.replaceState({}, "", "/verifier");
    } else if (user.role === "employee" && window.location.pathname !== "/") {
      window.history.replaceState({}, "", "/");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("expense_flow_user");
    // The URL stays on current portal path so Login shows the right tab
  };

  const handleProfileUpdate = (updatedUser: EmployeeProfile) => {
    setCurrentUser(updatedUser);
    localStorage.setItem("expense_flow_user", JSON.stringify(updatedUser));
  };

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div id="app-main-wrapper" className="flex min-h-screen bg-slate-50">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        user={currentUser}
        isMobileOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Navbar */}
        <Navbar
          user={currentUser}
          onLogout={handleLogout}
          onViewProfile={() => {
            setActiveTab("profile");
            setIsMobileSidebarOpen(false);
          }}
          onViewNotifications={() => {
            setActiveTab("expenses");
            setIsMobileSidebarOpen(false);
          }}
          onSelectNotification={(expenseId) => {
            setActiveTab("expenses");
            setTargetExpenseId(expenseId);
            setIsMobileSidebarOpen(false);
          }}
          onToggleSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        />

        {/* Scrollable View Container */}
        <main id="app-viewport" className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full"
            >
              {activeTab === "dashboard" && (
                currentUser.role === "admin" ? (
                  <AdminDashboard
                    user={currentUser}
                    onNavigateToQueue={(expenseId) => {
                      setActiveTab("expenses");
                      if (expenseId) setTargetExpenseId(expenseId);
                    }}
                    refreshTrigger={refreshTrigger}
                  />
                ) : currentUser.role === "verifier" ? (
                  <VerifierDashboard
                    user={currentUser}
                    onNavigateToQueue={(expenseId) => {
                      setActiveTab("expenses");
                      if (expenseId) setTargetExpenseId(expenseId);
                    }}
                    refreshTrigger={refreshTrigger}
                  />
                ) : (
                  <EmployeeDashboard
                    user={currentUser}
                    onNavigateToSubmit={() => setActiveTab("submit")}
                    onNavigateToExpenses={() => setActiveTab("expenses")}
                    onNavigateToAdvances={() => setActiveTab("advances")}
                    refreshTrigger={refreshTrigger}
                  />
                )
              )}

              {activeTab === "submit" && currentUser.role === "employee" && (
                <ExpenseForm
                  user={currentUser}
                  onSuccess={() => {
                    triggerRefresh();
                  }}
                  onBack={() => setActiveTab("dashboard")}
                />
              )}

              {activeTab === "advances" && (
                <AdvanceManagement
                  user={currentUser}
                  refreshTrigger={refreshTrigger}
                  onNavigateToSubmit={() => setActiveTab("submit")}
                  onBack={() => setActiveTab("dashboard")}
                />
              )}

              {activeTab === "expenses" && (
                <ExpenseList
                  user={currentUser}
                  refreshTrigger={refreshTrigger}
                  targetExpenseId={targetExpenseId}
                  onClearTargetExpense={() => setTargetExpenseId(null)}
                  onBack={() => setActiveTab("dashboard")}
                />
              )}

              {activeTab === "profile" && (
                <ProfileView
                  user={currentUser}
                  onProfileUpdate={handleProfileUpdate}
                />
              )}

              {activeTab === "analytics" && (
                <AnalyticsHub
                  user={currentUser}
                  refreshTrigger={refreshTrigger}
                />
              )}

              {activeTab === "reports" && (
                <Reports
                  user={currentUser}
                  refreshTrigger={refreshTrigger}
                />
              )}

              {activeTab === "bills" && currentUser.role === "admin" && (
                <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
                  <BillDocumentHub
                    user={currentUser}
                    refreshTrigger={refreshTrigger}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
