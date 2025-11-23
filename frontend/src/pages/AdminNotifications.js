import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Send, Users, Bell, BarChart2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { API } from '@/App';

const AdminNotifications = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, token } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState(null);
  const [usersWithNotifications, setUsersWithNotifications] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Form state
  const [sendMode, setSendMode] = useState('broadcast'); // broadcast | specific
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/dashboard');
  const [notificationType, setNotificationType] = useState('custom');
  const [searchQuery, setSearchQuery] = useState('');
  const [userSearchDebounce, setUserSearchDebounce] = useState('');

  useEffect(() => {
    if (user && user.role === 'admin') {
      loadData();
    } else if (user) {
      navigate('/dashboard');
    }
  }, [user]);

  const loadData = async () => {
    try {
      // Load stats
      const statsResponse = await axios.get(`${API}/admin/notifications/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(statsResponse.data);

      // Load users with notification subscriptions
      await loadUsersWithNotifications();
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const loadUsersWithNotifications = async (search = '') => {
    setLoadingUsers(true);
    try {
      const response = await axios.get(
        `${API}/admin/notifications/users-with-subscriptions`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            search: search || undefined,
            limit: 1000 // Load more users
          }
        }
      );
      setUsersWithNotifications(response.data.users || []);
      setTotalUsers(response.data.total || 0);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('ไม่สามารถโหลดรายชื่อผู้ใช้ได้');
    } finally {
      setLoadingUsers(false);
    }
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setUserSearchDebounce(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load users when search changes
  useEffect(() => {
    if (sendMode === 'specific') {
      loadUsersWithNotifications(userSearchDebounce);
    }
  }, [userSearchDebounce, sendMode]);

  const handleSendNotification = async () => {
    if (!title || !body) {
      toast.error('กรุณากรอกหัวข้อและข้อความ');
      return;
    }

    if (sendMode === 'specific' && selectedUsers.length === 0) {
      toast.error('กรุณาเลือกผู้ใช้อย่างน้อย 1 คน');
      return;
    }

    setSending(true);
    try {
      const payload = {
        title,
        body,
        url,
        notification_type: notificationType,
        user_ids: sendMode === 'broadcast' ? [] : selectedUsers
      };

      console.log('Sending notification with payload:', payload);

      const response = await axios.post(
        `${API}/notifications/send`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`✅ ส่งการแจ้งเตือนสำเร็จ! ส่งถึง ${response.data.sent} คน`);
      
      // Reset form
      setTitle('');
      setBody('');
      setUrl('/dashboard');
      setSelectedUsers([]);
      
      // Reload stats
      loadData();
    } catch (error) {
      console.error('Error sending notification:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถส่งการแจ้งเตือนได้');
    } finally {
      setSending(false);
    }
  };

  const handleTestSelfNotification = async () => {
    setSending(true);
    try {
      await axios.post(
        `${API}/notifications/test`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('ส่งการแจ้งเตือนทดสอบถึงตัวคุณเองแล้ว! 🔔');
    } catch (error) {
      console.error('Error sending test:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถส่งการแจ้งเตือนทดสอบได้');
    } finally {
      setSending(false);
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

        <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-8">
          🔔 Admin - จัดการการแจ้งเตือน
        </h1>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300">
              <div className="flex items-center gap-3">
                <UserCheck className="w-10 h-10 text-blue-600" />
                <div>
                  <p className="text-sm text-blue-700 font-semibold">Subscribers</p>
                  <p className="text-3xl font-black text-blue-900">{stats.unique_users}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300">
              <div className="flex items-center gap-3">
                <Bell className="w-10 h-10 text-green-600" />
                <div>
                  <p className="text-sm text-green-700 font-semibold">Total Sent</p>
                  <p className="text-3xl font-black text-green-900">{stats.total_notifications_sent}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-300">
              <div className="flex items-center gap-3">
                <BarChart2 className="w-10 h-10 text-orange-600" />
                <div>
                  <p className="text-sm text-orange-700 font-semibold">Unread</p>
                  <p className="text-3xl font-black text-orange-900">{stats.unread_notifications}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300">
              <div className="flex items-center gap-3">
                <Users className="w-10 h-10 text-purple-600" />
                <div>
                  <p className="text-sm text-purple-700 font-semibold">Active Devices</p>
                  <p className="text-3xl font-black text-purple-900">{stats.total_subscriptions}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Send Notification Form */}
          <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
            <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2">
              <Send className="w-6 h-6 text-[#00A9CE]" />
              ส่งการแจ้งเตือน
            </h2>

            {/* Send Mode */}
            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-900 mb-2">
                ส่งถึง
              </label>
              <select
                value={sendMode}
                onChange={(e) => setSendMode(e.target.value)}
                className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
              >
                <option value="broadcast">📢 ทุกคนที่ subscribe</option>
                <option value="specific">👤 เลือกผู้ใช้เฉพาะ</option>
              </select>
            </div>

            {/* User Selection (if specific mode) */}
            {sendMode === 'specific' && (
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  เลือกผู้ใช้ที่เปิด Notification ({selectedUsers.length}/{totalUsers} คน)
                </label>
                
                {/* Search Box */}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="🔍 ค้นหาชื่อหรืออีเมล..."
                  className="w-full p-2 mb-2 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                />
                
                {loadingUsers && (
                  <div className="text-center py-4 text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00A9CE] mx-auto"></div>
                    <p className="mt-2 text-sm">กำลังโหลด...</p>
                  </div>
                )}
                
                {/* User List with Checkboxes */}
                {!loadingUsers && (
                  <div className="border-2 border-gray-300 rounded-lg max-h-[400px] overflow-y-auto p-3 space-y-2 bg-gray-50">
                    {usersWithNotifications.length === 0 && (
                      <div className="text-center text-gray-500 py-8">
                        {searchQuery ? '🔍 ไม่พบผู้ใช้ที่ตรงกับคำค้นหา' : '📭 ยังไม่มีผู้ใช้ที่เปิด notification'}
                      </div>
                    )}
                    
                    {usersWithNotifications.map((user) => {
                      const userId = user.id;
                      const isSelected = selectedUsers.includes(userId);
                      const displayName = user.name || user.full_name || 'ไม่มีชื่อ';
                      
                      return (
                        <label
                          key={userId}
                          className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-[#00A9CE] border-[#005A73] text-white shadow-md' 
                              : 'bg-white border-gray-200 hover:border-[#00A9CE] hover:shadow-sm'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUsers([...selectedUsers, userId]);
                              } else {
                                setSelectedUsers(selectedUsers.filter(id => id !== userId));
                              }
                            }}
                            className="w-5 h-5 mr-3 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate">
                              {displayName}
                            </div>
                            <div className={`text-sm truncate ${isSelected ? 'text-blue-100' : 'text-gray-600'}`}>
                              {user.email}
                            </div>
                            <div className={`text-xs mt-1 ${isSelected ? 'text-blue-200' : 'text-gray-500'}`}>
                              📱 {user.subscription_count} อุปกรณ์
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                
                {/* Quick Actions */}
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedUsers(usersWithNotifications.map(user => user.id));
                    }}
                    disabled={loadingUsers || usersWithNotifications.length === 0}
                    className="text-xs"
                  >
                    ✅ เลือกทั้งหมด
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedUsers([])}
                    className="text-xs"
                  >
                    ❌ ยกเลิกทั้งหมด
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadUsersWithNotifications(userSearchDebounce)}
                    disabled={loadingUsers}
                    className="text-xs ml-auto"
                  >
                    🔄 รีเฟรช
                  </Button>
                </div>
                
                {totalUsers > usersWithNotifications.length && (
                  <p className="text-xs text-gray-600 mt-2 text-center">
                    แสดง {usersWithNotifications.length} จาก {totalUsers} คน
                  </p>
                )}
              </div>
            )}

            {/* Notification Type */}
            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-900 mb-2">
                ประเภท
              </label>
              <select
                value={notificationType}
                onChange={(e) => setNotificationType(e.target.value)}
                className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
              >
                <option value="system_announcement">📢 ประกาศจากระบบ</option>
                <option value="content_update">🔔 อัปเดตเนื้อหา</option>
                <option value="custom">✨ ข้อความพิเศษ</option>
              </select>
            </div>

            {/* Title */}
            <div className="mb-4">
              <label htmlFor="title" className="block text-sm font-bold text-gray-900 mb-2">
                หัวข้อ *
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น: ข่าวสารใหม่จากระบบ"
                className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
              />
            </div>

            {/* Body */}
            <div className="mb-4">
              <label htmlFor="body" className="block text-sm font-bold text-gray-900 mb-2">
                ข้อความ *
              </label>
              <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="พิมพ์ข้อความที่ต้องการส่ง..."
                rows={4}
                className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
              />
            </div>

            {/* URL */}
            <div className="mb-6">
              <label htmlFor="url" className="block text-sm font-bold text-gray-900 mb-2">
                URL ปลายทาง (เมื่อคลิก notification)
              </label>
              <input
                type="text"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/dashboard"
                className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={handleSendNotification}
                disabled={sending || !title || !body}
                className="flex-1 bg-gradient-to-r from-[#005A73] to-[#00A9CE] text-white font-bold"
              >
                {sending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    กำลังส่ง...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    ส่งการแจ้งเตือน
                  </>
                )}
              </Button>
              <Button
                onClick={handleTestSelfNotification}
                disabled={sending}
                variant="outline"
                className="border-2 border-[#00A9CE] text-[#005A73] hover:bg-[#00A9CE]/10 font-bold"
              >
                ทดสอบ (ตัวเอง)
              </Button>
            </div>
          </Card>

          {/* Users with Notifications List */}
          <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
            <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2">
              <Users className="w-6 h-6 text-[#00A9CE]" />
              ผู้ใช้ที่เปิด Notification ({totalUsers})
            </h2>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {usersWithNotifications.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 font-semibold">ยังไม่มีผู้ใช้ที่เปิด notification</p>
                </div>
              ) : (
                usersWithNotifications.slice(0, 20).map((user) => {
                  const displayName = user.name || user.full_name || 'ไม่มีชื่อ';
                  return (
                    <div
                      key={user.id}
                      className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-[#00A9CE] transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#007B9A] to-[#00A9CE] flex items-center justify-center text-white font-bold flex-shrink-0">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 truncate">{displayName}</p>
                          <p className="text-sm text-gray-600 truncate">{user.email}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            📱 {user.subscription_count} อุปกรณ์
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">
                            Active
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              
              {usersWithNotifications.length > 20 && (
                <div className="text-center py-3 text-sm text-gray-600">
                  แสดง 20 คนแรก จากทั้งหมด {totalUsers} คน
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminNotifications;
