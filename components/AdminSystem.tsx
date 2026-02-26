
import React, { useState } from 'react';
import { Database, Settings, AlertCircle, RefreshCw, X, Check } from 'lucide-react';

interface AdminSystemProps {
  onReset: () => void;
  onBack: () => void;
  supabaseStatus?: { 
    connected: boolean; 
    error: string | null;
    tables?: Record<string, boolean>;
  };
}

const AdminSystem: React.FC<AdminSystemProps> = ({ onReset, onBack, supabaseStatus }) => {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const handleResetExecute = () => {
    onReset();
    setShowResetConfirm(false);
  };

  const handleInitSupabase = async () => {
    setIsInitializing(true);
    try {
      const res = await fetch('/api/supabase-init', { method: 'POST' });
      if (res.ok) {
        alert("Đã khởi tạo dữ liệu cấu hình mặc định trên Supabase!");
        window.location.reload();
      } else {
        const err = await res.json();
        alert("Lỗi: " + err.error);
      }
    } catch (e) {
      alert("Lỗi kết nối server");
    } finally {
      setIsInitializing(false);
    }
  };

  const sqlScript = `-- 1. Bảng cấu hình hệ thống
CREATE TABLE system_config (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);
INSERT INTO system_config (id, data) VALUES ('config', '{"budget": 30000000, "rankProfit": 0}');

-- 2. Bảng người dùng
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- 3. Bảng khoản vay
CREATE TABLE loans (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- 4. Bảng thông báo
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);`;

  return (
    <div className="w-full bg-black min-h-screen px-5 pb-32 animate-in fade-in duration-500">
      {/* Header Area */}
      <div className="flex items-center gap-4 pt-10 mb-8 px-1">
        <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
          CÀI ĐẶT HỆ THỐNG
        </h1>
      </div>

      {/* Data Management Section */}
      <div className="bg-[#111111] border border-white/5 rounded-[2.5rem] p-8 space-y-8 mb-6">
        <div className="flex items-center gap-3">
          <Database className="text-[#ff8c00]" size={20} />
          <h4 className="text-[11px] font-black text-white uppercase tracking-widest">Trạng thái Database (Supabase)</h4>
        </div>

        <div className={`rounded-[2rem] p-6 space-y-4 border ${supabaseStatus?.connected ? 'bg-blue-500/5 border-blue-500/10' : 'bg-red-500/5 border-red-500/10'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${supabaseStatus?.connected ? 'bg-blue-500/20 text-blue-500' : 'bg-red-500/20 text-red-500'}`}>
                <Database size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black text-white uppercase tracking-widest">
                  {supabaseStatus?.connected ? 'Đã kết nối Supabase' : 'Lỗi kết nối Supabase'}
                </p>
                <p className="text-[8px] font-bold text-gray-500 uppercase tracking-tighter">
                  {supabaseStatus?.connected ? 'Dữ liệu đang được lưu trữ an toàn trên Cloud' : 'Hệ thống đang sử dụng bộ nhớ tạm thời'}
                </p>
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${supabaseStatus?.connected ? 'bg-blue-500/20 text-blue-500' : 'bg-red-500/20 text-red-500'}`}>
              {supabaseStatus?.connected ? 'Online' : 'Offline'}
            </div>
          </div>
          
          {supabaseStatus?.error && (
            <div className="p-4 bg-black/40 rounded-xl border border-red-500/20">
              <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">Chi tiết lỗi:</p>
              <p className="text-[10px] font-mono text-gray-400 break-all leading-relaxed">
                {supabaseStatus.error}
              </p>
            </div>
          )}

          {/* Table Status Grid */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {['system_config', 'users', 'loans', 'notifications'].map(tableName => (
              <div key={tableName} className="bg-black/20 p-3 rounded-xl border border-white/5 flex items-center justify-between">
                <span className="text-[8px] font-black text-gray-500 uppercase">{tableName}</span>
                {supabaseStatus?.tables?.[tableName] ? (
                  <Check size={12} className="text-green-500" />
                ) : (
                  <X size={12} className="text-red-500" />
                )}
              </div>
            ))}
          </div>

          <button 
            onClick={handleInitSupabase}
            disabled={isInitializing || !supabaseStatus?.connected}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
          >
            {isInitializing ? <RefreshCw className="animate-spin" size={14} /> : <Database size={14} />}
            Khởi tạo dữ liệu mẫu
          </button>
        </div>

        {/* SQL Script Display */}
        <div className="bg-black/40 border border-white/5 rounded-[2rem] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h5 className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Mã SQL khởi tạo bảng</h5>
            <span className="text-[7px] font-bold text-blue-500 uppercase">Copy & Run in SQL Editor</span>
          </div>
          <pre className="bg-black p-4 rounded-xl text-[8px] font-mono text-blue-400/80 overflow-x-auto leading-relaxed border border-white/5">
            {sqlScript}
          </pre>
          <p className="text-[8px] font-bold text-gray-600 uppercase leading-tight">
            * Lưu ý: Bạn cần chạy mã này trong phần "SQL Editor" trên trang quản trị Supabase để tạo các thành phần cần thiết.
          </p>
        </div>

        <div className="bg-red-500/5 border border-red-500/10 rounded-[2rem] p-6 space-y-6">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <AlertCircle className="text-red-500" size={24} />
            </div>
            <div className="space-y-2">
              <h5 className="text-[10px] font-black text-red-500 uppercase tracking-widest">Khôi phục mặc định (Reset)</h5>
              <p className="text-[10px] font-bold text-gray-400 leading-relaxed uppercase tracking-tighter">
                Hành động này sẽ xóa toàn bộ danh sách khách hàng, lịch sử vay, nhật ký hệ thống và đưa ngân sách về mặc định là 30.000.000 VNĐ.
              </p>
            </div>
          </div>

          <button 
            onClick={() => setShowResetConfirm(true)}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-5 rounded-2xl text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-red-900/20 active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <RefreshCw size={16} />
            Thực thi Reset toàn bộ
          </button>
        </div>
      </div>

      {/* Rules Configuration Section */}
      <div className="bg-[#111111] border border-white/5 rounded-[2.5rem] p-8 space-y-8">
        <div className="flex items-center gap-3">
          <Settings className="text-blue-500" size={20} />
          <h4 className="text-[11px] font-black text-white uppercase tracking-widest">Cấu hình quy định</h4>
        </div>

        <div className="p-4">
          <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest leading-relaxed italic text-center">
            Tính năng cấu hình lãi suất, ngày trả cố định, API Zalo... đang được phát triển trong phiên bản tiếp theo.
          </p>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-12 text-center opacity-30">
        <p className="text-[8px] font-black text-gray-500 uppercase tracking-[0.3em]">System Kernel v1.26 PRO</p>
      </div>

      {/* Popup xác nhận Reset hệ thống */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in duration-300">
          <div className="bg-[#111111] border border-red-500/20 w-full max-w-sm rounded-[2.5rem] p-8 space-y-8 relative shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-red-600"></div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-red-600/10 rounded-full flex items-center justify-center text-red-600">
                 <AlertCircle size={32} />
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">RESET HỆ THỐNG?</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase leading-relaxed px-4">
                  Thao tác này sẽ <span className="text-red-500 font-black">XÓA VĨNH VIỄN</span> toàn bộ khách hàng, lịch sử vay và logs. Ngân sách sẽ quay về <span className="text-white font-black">30.000.000 đ</span>.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
               <button 
                 onClick={() => setShowResetConfirm(false)}
                 className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-gray-500 uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
               >
                 <X size={14} /> HỦY BỎ
               </button>
               <button 
                 onClick={handleResetExecute}
                 className="flex-1 py-4 bg-red-600 rounded-2xl text-[10px] font-black text-white uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/40"
               >
                 <Check size={14} /> ĐỒNG Ý RESET
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSystem;
