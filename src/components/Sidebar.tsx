import { LayoutDashboard, FileText, PlusCircle, User, BarChart2, FolderOpen, Shield, FileCheck, X, LogOut } from "lucide-react";
import { type EmployeeProfile } from "../lib/firebase";

export type SidebarTab = "dashboard" | "submit" | "expenses" | "profile" | "analytics" | "reports" | "bills";

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  user: EmployeeProfile;
  isMobileOpen?: boolean;
  onClose?: () => void;
  onLogout?: () => void;
}

export default function Sidebar({ activeTab, onTabChange, user, isMobileOpen, onClose, onLogout }: SidebarProps) {
  const employeeMenuItems = [
    { id: "dashboard" as SidebarTab, label: "Dashboard", icon: LayoutDashboard },
    { id: "submit" as SidebarTab, label: "New Expense", icon: PlusCircle },
    { id: "expenses" as SidebarTab, label: "My Expenses", icon: FileText },
    { id: "bills" as SidebarTab, label: "My Bill Documents", icon: FileCheck },
    { id: "profile" as SidebarTab, label: "My Profile", icon: User },
    { id: "analytics" as SidebarTab, label: "Spending Trends", icon: BarChart2 },
    { id: "reports" as SidebarTab, label: "Reports", icon: FolderOpen },
  ];

  const adminMenuItems = [
    { id: "dashboard" as SidebarTab, label: "Admin Dashboard", icon: Shield },
    { id: "bills" as SidebarTab, label: "Bill Document Vault", icon: FileCheck },
    { id: "expenses" as SidebarTab, label: "Expense Queue", icon: FileText },
    { id: "analytics" as SidebarTab, label: "Analytics Hub", icon: BarChart2 },
    { id: "reports" as SidebarTab, label: "Report Center", icon: FolderOpen },
    { id: "profile" as SidebarTab, label: "Profile", icon: User },
  ];

  const items = user.role === "admin" ? adminMenuItems : employeeMenuItems;

  return (
    <>
      {/* Backdrop overlay for mobile devices */}
      {isMobileOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden cursor-pointer transition-opacity"
        />
      )}

      <aside 
        id="app-sidebar" 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col h-screen border-r border-slate-800 transition-transform duration-300 lg:static lg:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-base">
              EF
            </div>
            <div>
              <span className="block text-sm font-bold text-white tracking-wider font-sans uppercase">ExpenseFlow</span>
              <span className="block text-[10px] text-slate-500 font-semibold tracking-widest uppercase">Internal</span>
            </div>
          </div>
          
          {/* Close Menu button for tablets/mobile */}
          <button
            id="close-mobile-sidebar-btn"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition lg:hidden cursor-pointer"
            title="Close Menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav id="sidebar-nav" className="flex-1 px-4 py-6 space-y-1.5">
          <span className="block px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">
            Workspace Navigation
          </span>
          {items.map(item => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                id={`sidebar-tab-${item.id}`}
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  if (onClose) onClose();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <IconComponent className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Info */}
        <div className="p-4 border-t border-slate-800 text-xs text-slate-500 space-y-2.5">
          <button
            id="sidebar-switch-portal-btn"
            onClick={() => {
              if (onClose) onClose();
              const targetUrl = user.role === "admin" ? "/" : "/admin";
              window.history.pushState({}, "", targetUrl);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 transition cursor-pointer border border-slate-700/60"
          >
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-400" />
              <span>{user.role === "admin" ? "Employee Portal" : "Admin Portal"}</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-900 px-1.5 py-0.5 rounded">
              {user.role === "admin" ? "/" : "/admin"}
            </span>
          </button>

          {onLogout && (
            <button
              id="sidebar-logout-btn"
              onClick={() => {
                if (onClose) onClose();
                onLogout();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-900/40 transition cursor-pointer border border-rose-900/40"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
            <span className="text-[10px] font-semibold text-slate-400">Database Live Connected</span>
          </div>
        </div>
      </aside>
    </>
  );
}
