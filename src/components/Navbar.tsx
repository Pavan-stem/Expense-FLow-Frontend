import { useState, useEffect } from "react";
import { type EmployeeProfile, type AppNotification, getUserNotifications, markNotificationAsRead, markExpenseNotificationsAsRead } from "../lib/firebase";
import { Bell, LogOut, Clock, CheckCircle, XCircle, AlertCircle, FileText, User, Menu } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface NavbarProps {
  user: EmployeeProfile;
  onLogout: () => void;
  onViewProfile: () => void;
  onViewNotifications: () => void;
  onToggleSidebar?: () => void;
  onSelectNotification?: (expenseId: string) => void;
}

export default function Navbar({ 
  user, 
  onLogout, 
  onViewProfile, 
  onViewNotifications, 
  onToggleSidebar,
  onSelectNotification
}: NavbarProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [time, setTime] = useState(new Date());

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const data = await getUserNotifications(user.employeeId);
      setNotifications(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Refresh notifications every 20 seconds
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, [user.employeeId]);

  const handleNotificationClick = async (notif: AppNotification) => {
    try {
      const textToSearch = `${notif.title || ''} ${notif.message || ''}`;
      const voucherMatch = textToSearch.match(/SW-\d{2}-\d{3}/i);
      const targetVoucherNumber = notif.voucherNumber || (voucherMatch ? voucherMatch[0] : undefined);
      const targetExpenseId = notif.expenseId;

      // Always mark this notification as read in DB
      await markNotificationAsRead(notif.id);

      // Mark all other notifications for this voucher bill as read in DB
      if (targetExpenseId || targetVoucherNumber) {
        await markExpenseNotificationsAsRead(user.employeeId, targetExpenseId, targetVoucherNumber);
      }

      // Update local state so all notifications belonging to the same voucher bill are marked as read
      setNotifications(prev => prev.map(n => {
        const nText = `${n.title || ''} ${n.message || ''}`;
        const matchesExpense = targetExpenseId && (n.expenseId === targetExpenseId || nText.includes(targetExpenseId));
        const matchesVoucher = targetVoucherNumber && (n.voucherNumber === targetVoucherNumber || nText.includes(targetVoucherNumber));
        if (n.id === notif.id || matchesExpense || matchesVoucher) {
          return { ...n, read: true };
        }
        return n;
      }));
      
      setShowNotifDropdown(false);
      
      const targetId = targetExpenseId || targetVoucherNumber;

      if (targetId && onSelectNotification) {
        onSelectNotification(targetId);
      } else {
        onViewNotifications();
      }
    } catch (err) {
      console.error("Error marking notification read:", err);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header id="app-navbar" className="bg-white border-b border-slate-100 sticky top-0 z-30 h-16 flex items-center justify-between px-2 sm:px-6 shadow-sm min-w-0">
      {/* Title / Identity */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            id="nav-sidebar-toggle-btn"
            onClick={onToggleSidebar}
            className="p-1 sm:p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition lg:hidden cursor-pointer flex-shrink-0"
            title="Open Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-sm sm:text-lg md:text-xl font-bold text-slate-800 tracking-tight font-sans truncate">
          ExpenseFlow
        </h1>
        <div className="hidden xs:block h-3.5 w-[1px] bg-slate-200" />
        <span className="hidden xs:inline-block text-[9px] sm:text-xs font-semibold px-1.5 sm:px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-mono uppercase tracking-wider flex-shrink-0">
          {user.role}
        </span>
      </div>

      {/* Utilities */}
      <div className="flex items-center gap-1.5 sm:gap-4 md:gap-6 flex-shrink-0">
        {/* Real-time Clock */}
        <div id="nav-clock" className="hidden md:flex items-center gap-2 text-slate-500 font-mono text-sm border-r border-slate-100 pr-4">
          <Clock className="h-4 w-4 text-slate-400" />
          <span>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>

        {/* Notifications */}
        <div className="relative flex-shrink-0">
          <button
            id="nav-notif-bell"
            onClick={() => setShowNotifDropdown(!showNotifDropdown)}
            className="p-1.5 sm:p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition duration-150 relative cursor-pointer"
          >
            <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
            {unreadCount > 0 && (
              <span id="nav-notif-badge" className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4 bg-rose-500 text-[9px] sm:text-[10px] font-bold text-white flex items-center justify-center rounded-full animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifDropdown(false)} />
                <motion.div
                  id="nav-notif-dropdown"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2.5 w-72 sm:w-80 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden"
                >
                  <div className="p-3.5 sm:p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map(notif => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`p-3.5 hover:bg-slate-50 transition cursor-pointer flex gap-3 ${!notif.read ? "bg-indigo-50/20" : ""}`}
                        >
                          <div className="mt-0.5">
                            {notif.title.toLowerCase().includes("approve") ? (
                              <CheckCircle className="h-4 w-4 text-emerald-500" />
                            ) : notif.title.toLowerCase().includes("reject") ? (
                              <XCircle className="h-4 w-4 text-rose-500" />
                            ) : notif.title.toLowerCase().includes("submit") ? (
                              <FileText className="h-4 w-4 text-indigo-500" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-amber-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{notif.title}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{notif.message}</p>
                            <span className="text-[9px] text-slate-400 block mt-1.5 font-mono">
                              {new Date(notif.timestamp).toLocaleDateString()} {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {!notif.read && (
                            <div className="w-2 h-2 bg-indigo-600 rounded-full self-center flex-shrink-0" />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* User Card */}
        <div id="nav-user-profile" className="flex items-center gap-2 sm:gap-3 cursor-pointer group flex-shrink-0" onClick={onViewProfile}>
          <div className="hidden sm:block text-right">
            <span className="block text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition">{user.name}</span>
          </div>
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-600 font-semibold text-xs sm:text-sm group-hover:border-indigo-200 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition">
            {user.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
          </div>
        </div>

        {/* Logout */}
        <button
          id="nav-logout-btn"
          onClick={onLogout}
          className="p-1.5 sm:p-2 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-100 sm:border-transparent sm:bg-transparent sm:text-slate-400 sm:hover:text-rose-600 sm:hover:bg-rose-50 rounded-xl transition duration-150 flex-shrink-0 cursor-pointer flex items-center gap-1"
          title="Sign Out"
        >
          <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </div>
    </header>
  );
}
