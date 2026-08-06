import { useState, useEffect } from "react";
import { seedDatabaseIfNeeded, type EmployeeProfile } from "./lib/firebase";
import Login from "./components/Login";
import Navbar from "./components/Navbar";
import Sidebar, { type SidebarTab } from "./components/Sidebar";
import EmployeeDashboard from "./components/EmployeeDashboard";
import AdminDashboard from "./components/AdminDashboard";
import ExpenseForm from "./components/ExpenseForm";
import ExpenseList from "./components/ExpenseList";
import ProfileView from "./components/ProfileView";
import AnalyticsHub from "./components/AnalyticsHub";
import Reports from "./components/Reports";
import BillDocumentHub from "./components/BillDocumentHub";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [currentUser, setCurrentUser] = useState<EmployeeProfile | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("dashboard");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [targetExpenseId, setTargetExpenseId] = useState<string | null>(null);

  // Database auto-seeding on mount
  useEffect(() => {
    const initDb = async () => {
      await seedDatabaseIfNeeded();
    };
    initDb();

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
    // Default to dashboard after logging in
    setActiveTab("dashboard");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("expense_flow_user");
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
                ) : (
                  <EmployeeDashboard
                    user={currentUser}
                    onNavigateToSubmit={() => setActiveTab("submit")}
                    onNavigateToExpenses={() => setActiveTab("expenses")}
                    refreshTrigger={refreshTrigger}
                  />
                )
              )}

              {activeTab === "submit" && (
                <ExpenseForm
                  user={currentUser}
                  onSuccess={() => {
                    triggerRefresh();
                    setActiveTab("expenses");
                  }}
                />
              )}

              {activeTab === "expenses" && (
                <ExpenseList
                  user={currentUser}
                  refreshTrigger={refreshTrigger}
                  targetExpenseId={targetExpenseId}
                  onClearTargetExpense={() => setTargetExpenseId(null)}
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

              {activeTab === "bills" && (
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
