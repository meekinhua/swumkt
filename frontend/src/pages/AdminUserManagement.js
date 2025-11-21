import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  ArrowLeft, Shield, UserCheck, UserX, Search, Crown, 
  ChevronUp, ChevronDown, AlertTriangle 
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { API } from '@/App';

const AdminUserManagement = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [hardcodedAdmins, setHardcodedAdmins] = useState([]);

  useEffect(() => {
    if (user && user.role === 'admin') {
      loadData();
    } else if (user) {
      navigate('/dashboard');
    }
  }, [user]);

  useEffect(() => {
    // Filter users based on search query
    if (!allUsers || allUsers.length === 0) {
      setFilteredUsers([]);
      return;
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const filtered = allUsers.filter(u => 
        u?.full_name?.toLowerCase().includes(query) ||
        u?.email?.toLowerCase().includes(query)
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(allUsers);
    }
  }, [searchQuery, allUsers]);

  const loadData = async () => {
    try {
      // Load admins
      const adminsResponse = await axios.get(`${API}/admin/users/admins`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAdmins(adminsResponse.data.admins);
      setHardcodedAdmins(adminsResponse.data.hardcoded_admins);

      // Load all users
      const usersResponse = await axios.get(`${API}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAllUsers(usersResponse.data.users);
      setFilteredUsers(usersResponse.data.users);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handlePromoteToAdmin = async (userId, userName) => {
    if (!window.confirm(`ยืนยันการเลื่อนตำแหน่ง ${userName} เป็น Admin?`)) {
      return;
    }

    try {
      await axios.put(
        `${API}/admin/users/${userId}/promote`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`✅ เลื่อนตำแหน่ง ${userName} เป็น Admin สำเร็จ!`);
      loadData();
    } catch (error) {
      console.error('Error promoting user:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถเลื่อนตำแหน่งได้');
    }
  };

  const handleDemoteFromAdmin = async (userId, userName) => {
    if (!window.confirm(`⚠️ ยืนยันการลดตำแหน่ง ${userName} จาก Admin?\n\nผู้ใช้จะไม่สามารถเข้าถึงฟีเจอร์ Admin ได้อีกต่อไป`)) {
      return;
    }

    try {
      await axios.put(
        `${API}/admin/users/${userId}/demote`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`✅ ลดตำแหน่ง ${userName} จาก Admin สำเร็จ`);
      loadData();
    } catch (error) {
      console.error('Error demoting user:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถลดตำแหน่งได้');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#00A9CE]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/settings')}
          className="mb-4 text-gray-800 hover:text-[#00A9CE]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          กลับ
        </Button>

        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#E63946]/15 to-[#F25C66]/15 rounded-full border-2 border-[#E63946]/30 mb-6 shadow-lg">
            <Shield className="w-5 h-5 text-[#E63946]" />
            <span className="text-sm font-bold text-[#E63946]">Admin Only</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
            👥 จัดการผู้ใช้และ Admin
          </h1>
          <p className="text-lg text-gray-700 font-semibold">
            เลื่อนตำแหน่งหรือลดตำแหน่ง Admin ผู้ใช้ในระบบ
          </p>
        </div>

        {/* Current Admins Section */}
        <Card className="p-6 mb-6 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 shadow-xl">
          <h2 className="text-2xl font-black text-purple-900 mb-4 flex items-center gap-2">
            <Crown className="w-6 h-6" />
            Admin ปัจจุบัน ({admins.length})
          </h2>

          {hardcodedAdmins.length > 0 && (
            <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-yellow-900">🔒 Super Admin (ไม่สามารถลบได้)</p>
                  <p className="text-sm text-yellow-800 mt-1">
                    {hardcodedAdmins.join(', ')}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {admins.length === 0 ? (
              <p className="text-center text-purple-700 py-8">ไม่มี Admin</p>
            ) : (
              admins.map((admin) => (
                <div
                  key={admin.id}
                  className={`p-4 rounded-lg border-2 ${
                    admin.is_hardcoded_admin
                      ? 'bg-gradient-to-r from-yellow-50 to-yellow-100 border-yellow-400'
                      : 'bg-white border-purple-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-purple-400 flex items-center justify-center text-white font-bold text-lg">
                        {admin.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900">{admin.full_name}</p>
                          {admin.is_hardcoded_admin && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded">
                              <Crown className="w-3 h-3" />
                              SUPER
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{admin.email}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          สมัครเมื่อ: {new Date(admin.created_at).toLocaleDateString('th-TH')}
                        </p>
                      </div>
                    </div>
                    
                    {admin.can_be_demoted && admin.id !== user.id && (
                      <Button
                        onClick={() => handleDemoteFromAdmin(admin.id, admin.full_name)}
                        variant="outline"
                        className="border-2 border-red-500 text-red-600 hover:bg-red-50 font-bold"
                      >
                        <ChevronDown className="w-4 h-4 mr-2" />
                        ลดตำแหน่ง
                      </Button>
                    )}
                    
                    {admin.id === user.id && (
                      <span className="text-sm font-semibold text-purple-600">
                        (คุณ)
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* All Users Section */}
        <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
          <h2 className="text-2xl font-black text-gray-900 mb-4 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-[#00A9CE]" />
            ผู้ใช้ทั้งหมด ({allUsers.length})
          </h2>

          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อหรืออีเมล..."
                className="pl-10 border-2 border-gray-300 focus:border-[#00A9CE]"
              />
            </div>
          </div>

          {/* Users List */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <p className="text-center text-gray-600 py-8">ไม่พบผู้ใช้</p>
            ) : (
              filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-[#00A9CE] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                        u.role === 'admin' 
                          ? 'bg-gradient-to-br from-purple-600 to-purple-400'
                          : 'bg-gradient-to-br from-[#007B9A] to-[#00A9CE]'
                      }`}>
                        {u.full_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900">{u.full_name}</p>
                          {u.role === 'admin' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-bold rounded">
                              <Shield className="w-3 h-3" />
                              ADMIN
                            </span>
                          )}
                          {u.is_hardcoded_admin && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-bold rounded">
                              <Crown className="w-3 h-3" />
                              SUPER
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{u.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-semibold">
                            {u.user_type}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(u.created_at).toLocaleDateString('th-TH')}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="ml-4 flex-shrink-0">
                      {u.role !== 'admin' && (
                        <Button
                          onClick={() => handlePromoteToAdmin(u.id, u.full_name)}
                          className="bg-gradient-to-r from-purple-600 to-purple-500 text-white font-bold hover:from-purple-700 hover:to-purple-600"
                        >
                          <ChevronUp className="w-4 h-4 mr-2" />
                          เลื่อนเป็น Admin
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminUserManagement;
