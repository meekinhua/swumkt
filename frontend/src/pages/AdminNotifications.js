import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [subscriptions, setSubscriptions] = useState([]);
  const [users, setUsers] = useState([]);
  
  // Form state
  const [sendMode, setSendMode] = useState('broadcast'); // broadcast | specific
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [notificationType, setNotificationType] = useState('custom');

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

      // Load subscriptions
      const subsResponse = await axios.get(`${API}/admin/notifications/subscriptions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSubscriptions(subsResponse.data.subscriptions);

      // Load all users
      const usersResponse = await axios.get(`${API}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(usersResponse.data.users || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSendNotification = async () => {
    if (!title || !body) {
      toast.error('กรุณากรอกหัวข้อและข้อความ');
      return;
    }

    setSending(true);
    try {
      const payload = {
        title,
        body,
        url,
        notification_type: notificationType,
        user_ids: sendMode === 'broadcast' ? null : selectedUsers
      };

      const response = await axios.post(
        `${API}/notifications/send`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`✅ ส่งการแจ้งเตือนสำเร็จ! ส่งถึง ${response.data.sent} คน`);
      
      // Reset form
      setTitle('');
      setBody('');
      setUrl('/');
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
              <Select value={sendMode} onValueChange={setSendMode}>
                <SelectTrigger className="border-2 border-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="broadcast">📢 ทุกคนที่ subscribe</SelectItem>
                  <SelectItem value="specific">👤 เลือกผู้ใช้เฉพาะ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* User Selection (if specific mode) */}
            {sendMode === 'specific' && (
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  เลือกผู้ใช้
                </label>
                <select
                  multiple
                  value={selectedUsers}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                    setSelectedUsers(selected);
                  }}
                  className="w-full p-2 border-2 border-gray-300 rounded-lg min-h-[150px]"
                >
                  {subscriptions.map((sub) => (
                    <option key={sub.user_id} value={sub.user_id}>
                      {sub.user?.full_name || 'Unknown'} ({sub.user?.email || 'No email'})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-600 mt-1">
                  Hold Ctrl/Cmd เพื่อเลือกหลายคน (เลือกแล้ว: {selectedUsers.length})
                </p>
              </div>
            )}

            {/* Notification Type */}
            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-900 mb-2">
                ประเภท
              </label>
              <Select value={notificationType} onValueChange={setNotificationType}>
                <SelectTrigger className="border-2 border-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system_announcement">📢 ประกาศจากระบบ</SelectItem>
                  <SelectItem value="content_update">🔔 อัปเดตเนื้อหา</SelectItem>
                  <SelectItem value="custom">✨ ข้อความพิเศษ</SelectItem>
                </SelectContent>
              </Select>
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
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="พิมพ์ข้อความที่ต้องการส่ง..."
                rows={4}
                className="border-2 border-gray-300 focus:border-[#00A9CE]"
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

          {/* Subscriptions List */}
          <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
            <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2">
              <Users className="w-6 h-6 text-[#00A9CE]" />
              Subscribers ({subscriptions.length})
            </h2>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {subscriptions.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 font-semibold">ยังไม่มี subscribers</p>
                </div>
              ) : (
                subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-[#00A9CE] transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#007B9A] to-[#00A9CE] flex items-center justify-center text-white font-bold flex-shrink-0">
                        {sub.user?.full_name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900">{sub.user?.full_name || 'Unknown'}</p>
                        <p className="text-sm text-gray-600">{sub.user?.email || 'No email'}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Subscribed: {new Date(sub.created_at).toLocaleDateString('th-TH')}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">
                          Active
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminNotifications;
