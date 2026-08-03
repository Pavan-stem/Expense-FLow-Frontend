import React, { useState, useEffect } from "react";
import { 
  updateEmployeeProfile, 
  getAuditLogs, 
  type EmployeeProfile, 
  type AuditLog 
} from "../lib/firebase";
import { 
  User, 
  Shield, 
  Phone, 
  Mail, 
  Lock, 
  Save 
} from "lucide-react";

interface ProfileViewProps {
  user: EmployeeProfile;
  onProfileUpdate: (updatedUser: EmployeeProfile) => void;
}

export default function ProfileView({ user, onProfileUpdate }: ProfileViewProps) {
  const [name, setName] = useState(user.name);
  const [department, setDepartment] = useState(user.department);
  const [phone, setPhone] = useState(user.phone);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadLogs = async () => {
    setLoadingLogs(true);
    try {
      const allLogs = await getAuditLogs();
      // Filter logs for this employee if not admin
      const filtered = user.role === "admin" 
        ? allLogs 
        : allLogs.filter(log => log.userId === user.employeeId);
      setLogs(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [user.employeeId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const updatedData: Partial<EmployeeProfile> = {
        name,
        department,
        phone
      };
      await updateEmployeeProfile(user.employeeId, updatedData);
      
      onProfileUpdate({
        ...user,
        ...updatedData
      });
      setMessage("Profile settings successfully updated.");
      setIsEditing(false);
    } catch (err) {
      setMessage("Error updating profile settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="profile-view-container" className="py-6 px-4 max-w-5xl mx-auto space-y-6">
      {/* Title */}
      <div className="border-b border-slate-100 pb-5">
        <h2 className="text-xl font-bold text-slate-900 font-sans">Corporate Employee Directory</h2>
        <p className="text-xs text-slate-500 mt-0.5">Manage details and inspect transaction audit histories.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Info Card / Editor */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6 md:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <User className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Operational Profile</h3>
                <p className="text-[10px] text-slate-400">Employee ID: {user.employeeId}</p>
              </div>
            </div>

            {!isEditing ? (
              <button
                id="edit-profile-btn"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
              >
                Modify details
              </button>
            ) : (
              <button
                id="cancel-edit-profile-btn"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          {message && (
            <p id="profile-message-banner" className="p-3 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-xl border border-emerald-100">{message}</p>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Full Name</label>
                <input
                  id="profile-name"
                  type="text"
                  required
                  disabled={!isEditing}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 disabled:text-slate-500 disabled:bg-slate-50/50 text-xs outline-none focus:bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Email Address</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <Mail className="h-3.5 w-3.5" />
                  </span>
                  <input
                    id="profile-email"
                    type="email"
                    disabled
                    value={user.email}
                    className="block w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-slate-400 bg-slate-50/50 text-xs outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Phone Number</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <Phone className="h-3.5 w-3.5" />
                  </span>
                  <input
                    id="profile-phone"
                    type="text"
                    disabled={!isEditing}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="block w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-slate-900 bg-slate-50 disabled:text-slate-500 disabled:bg-slate-50/50 text-xs outline-none focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Role Type</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                  <input
                    id="profile-role"
                    type="text"
                    disabled
                    value={user.role.toUpperCase()}
                    className="block w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-slate-400 bg-slate-50/50 text-xs outline-none uppercase font-mono tracking-wider font-semibold"
                  />
                </div>
              </div>
            </div>

            {isEditing && (
              <div className="border-t border-slate-50 pt-4 flex justify-end">
                <button
                  id="save-profile-btn"
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md flex items-center gap-1 transition cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving Changes..." : "Save details"}
                </button>
              </div>
            )}
          </form>
        </div>

      </div>
    </div>
  );
}
