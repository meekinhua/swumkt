import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, BellOff, ArrowLeft, Send, CheckCircle, XCircle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { API } from '@/App';
import { pushNotifications } from '@/utils/pushNotifications';
import IOSInstallPrompt from '@/components/IOSInstallPrompt';

const NotificationSettings = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, token } = useAuth();
  
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('default');
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState({
    comment_notifications: true,
    zbs04_notifications: true,
    system_notifications: true,
    content_update_notifications: true,
    custom_notifications: true
  });
  const [notifications, setNotifications] = useState([]);
  const [sending, setSending] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (user) {
      // Check iOS
      const iosDetected = pushNotifications.isIOS();
      const standaloneDetected = pushNotifications.isStandalone();
      
      // Debug log
      console.log('🔍 Device Detection:', {
        isIOS: iosDetected,
        isStandalone: standaloneDetected,
        matchMedia: window.matchMedia('(display-mode: standalone)').matches,
        navigatorStandalone: window.navigator.standalone,
        userAgent: navigator.userAgent
      });
      
      setIsIOS(iosDetected);
      setIsStandalone(standaloneDetected);
      
      loadSettings();
      loadNotifications();
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      // Check permission status
      setPermissionStatus(pushNotifications.getPermissionStatus());
      
      // Check subscription status
      const subscribed = await pushNotifications.isSubscribed();
      setIsSubscribed(subscribed);
      
      // Load preferences
      const response = await axios.get(`${API}/notifications/preferences`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPreferences(response.data);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('ไม่สามารถโหลดการตั้งค่าได้');
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async () => {
    try {
      const response = await axios.get(`${API}/notifications?limit=20`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(response.data.notifications);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const handleEnableNotifications = async () => {
    try {
      // Check if iOS and not installed as PWA
      if (isIOS && !isStandalone) {
        setShowIOSPrompt(true);
        return;
      }
      
      // Request permission
      const granted = await pushNotifications.requestPermission();
      
      if (granted) {
        // Subscribe to push
        await pushNotifications.subscribe(token);
        setIsSubscribed(true);
        setPermissionStatus('granted');
        toast.success('เปิดใช้งานการแจ้งเตือนสำเร็จ! 🔔');
      } else {
        toast.error('คุณปฏิเสธการแจ้งเตือน กรุณาเปิดใช้งานในการตั้งค่าเบราว์เซอร์');
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      toast.error('ไม่สามารถเปิดใช้งานการแจ้งเตือนได้: ' + error.message);
    }
  };

  const handleDisableNotifications = async () => {
    try {
      await pushNotifications.unsubscribe(token);
      setIsSubscribed(false);
      toast.success('ปิดการแจ้งเตือนแล้ว');
    } catch (error) {
      console.error('Error disabling notifications:', error);
      toast.error('ไม่สามารถปิดการแจ้งเตือนได้');
    }
  };

  const handlePreferenceChange = async (key) => {
    const newPreferences = {
      ...preferences,
      [key]: !preferences[key]
    };
    
    setPreferences(newPreferences);
    
    try {
      await axios.put(
        `${API}/notifications/preferences`,
        newPreferences,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('บันทึกการตั้งค่าแล้ว');
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast.error('ไม่สามารถบันทึกการตั้งค่าได้');
      setPreferences(preferences);
    }
  };

  const handleSendTest = async () => {
    setSending(true);
    try {
      const response = await axios.post(
        `${API}/notifications/test`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('ส่งการแจ้งเตือนทดสอบแล้ว! ตรวจสอบที่เบราว์เซอร์ของคุณ 🔔');
      
      // Reload notifications to show the test one
      setTimeout(loadNotifications, 1000);
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถส่งการแจ้งเตือนทดสอบได้');
    } finally {
      setSending(false);
    }
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'เมื่อสักครู่';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} วันที่แล้ว`;
    return date.toLocaleDateString('th-TH');
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

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/profile')}
          className="mb-4 text-gray-800 hover:text-[#00A9CE]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          กลับ
        </Button>

        <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-8">
          ⚙️ การตั้งค่าการแจ้งเตือน
        </h1>

        {/* iOS Install Prompt Modal */}
        {showIOSPrompt && <IOSInstallPrompt onClose={() => setShowIOSPrompt(false)} />}

        {/* Debug Info Card (temporary for testing) */}
        {isIOS && (
          <Card className="p-4 mb-4 bg-gray-50 border border-gray-300">
            <details>
              <summary className="cursor-pointer font-bold text-sm text-gray-700">
                🔧 Debug Info (สำหรับทดสอบ)
              </summary>
              <div className="mt-2 text-xs space-y-1">
                <p>📱 isIOS: <strong>{isIOS ? 'Yes' : 'No'}</strong></p>
                <p>📲 isStandalone: <strong>{isStandalone ? 'Yes ✅' : 'No ❌'}</strong></p>
                <p>🖥️ matchMedia: <strong>{window.matchMedia('(display-mode: standalone)').matches ? 'Yes' : 'No'}</strong></p>
                <p>🧭 navigator.standalone: <strong>{window.navigator.standalone ? 'Yes' : 'No'}</strong></p>
                <p className="text-xs text-gray-500 break-all">User Agent: {navigator.userAgent.substring(0, 100)}...</p>
                <Button
                  onClick={() => {
                    setIsIOS(pushNotifications.isIOS());
                    setIsStandalone(pushNotifications.isStandalone());
                    toast.success('Refreshed detection!');
                  }}
                  className="mt-2 text-xs"
                  size="sm"
                >
                  🔄 Refresh Detection
                </Button>
              </div>
            </details>
          </Card>
        )}

        {/* iOS Warning for non-PWA */}
        {isIOS && !isStandalone && (
          <Card className="p-6 mb-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 shadow-xl">
            <div className="flex items-start gap-4">
              <Smartphone className="w-12 h-12 text-blue-600 flex-shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-black text-blue-900 mb-2">
                  📱 สำหรับผู้ใช้ iPhone/iPad
                </h2>
                <p className="text-blue-800 mb-3 font-semibold">
                  การแจ้งเตือนบน iOS ต้องติดตั้งแอปก่อน (Add to Home Screen)
                </p>
                <Button
                  onClick={() => setShowIOSPrompt(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  ดูวิธีติดตั้ง →
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Enable/Disable Notifications */}
        <Card className="p-6 mb-6 bg-white/98 border-2 border-gray-300 shadow-xl">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-black text-gray-900 mb-2 flex items-center gap-2">
                <Bell className="w-6 h-6 text-[#00A9CE]" />
                การแจ้งเตือนแบบ Push
              </h2>
              <p className="text-gray-600 mb-4">
                {isSubscribed 
                  ? '✅ คุณได้เปิดใช้งานการแจ้งเตือนแล้ว คุณจะได้รับการแจ้งเตือนแม้ว่าเบราว์เซอร์จะไม่ได้เปิดอยู่'
                  : isIOS && !isStandalone
                  ? '📱 กรุณาติดตั้งแอปก่อนเพื่อเปิดใช้งานการแจ้งเตือน'
                  : '🔕 เปิดใช้งานการแจ้งเตือนเพื่อรับข่าวสารและการอัปเดตแบบ real-time'
                }
              </p>
              {permissionStatus === 'denied' && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-red-700 font-semibold">
                    ⚠️ คุณได้ปฏิเสธการแจ้งเตือนแล้ว กรุณาเปิดใช้งานในการตั้งค่าเบราว์เซอร์
                  </p>
                </div>
              )}
            </div>
            <div className="ml-4">
              {isSubscribed ? (
                <Button
                  onClick={handleDisableNotifications}
                  variant="outline"
                  className="border-2 border-red-500 text-red-600 hover:bg-red-50 font-bold"
                >
                  <BellOff className="w-4 h-4 mr-2" />
                  ปิดการแจ้งเตือน
                </Button>
              ) : isIOS && !isStandalone ? (
                <Button
                  onClick={() => setShowIOSPrompt(true)}
                  className="bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold"
                >
                  <Smartphone className="w-4 h-4 mr-2" />
                  ติดตั้งแอป
                </Button>
              ) : (
                <Button
                  onClick={handleEnableNotifications}
                  disabled={permissionStatus === 'denied'}
                  className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] text-white font-bold"
                >
                  <Bell className="w-4 h-4 mr-2" />
                  เปิดการแจ้งเตือน
                </Button>
              )}
            </div>
          </div>

          {/* Test Notification */}
          {isSubscribed && (
            <div className="mt-4 pt-4 border-t-2 border-gray-200">
              <Button
                onClick={handleSendTest}
                disabled={sending}
                variant="outline"
                className="border-2 border-[#00A9CE] text-[#005A73] hover:bg-[#00A9CE]/10 font-bold"
              >
                {sending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                    กำลังส่ง...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    ทดสอบส่งการแจ้งเตือน
                  </>
                )}
              </Button>
            </div>
          )}
        </Card>

        {/* Notification Preferences */}
        {isSubscribed && (
          <Card className="p-6 mb-6 bg-white/98 border-2 border-gray-300 shadow-xl">
            <h2 className="text-2xl font-black text-gray-900 mb-4">
              🎛️ ประเภทการแจ้งเตือน
            </h2>
            <p className="text-gray-600 mb-6">
              เลือกประเภทการแจ้งเตือนที่คุณต้องการรับ
            </p>

            <div className="space-y-4">
              {[
                { key: 'comment_notifications', label: '💬 ความคิดเห็นใหม่ในเนื้อหาของคุณ' },
                { key: 'zbs04_notifications', label: '📝 การมอบหมายงาน ZBS04' },
                { key: 'system_notifications', label: '📢 ประกาศจากระบบ' },
                { key: 'content_update_notifications', label: '🔔 อัปเดตเนื้อหาที่คุณติดตาม' },
                { key: 'custom_notifications', label: '✨ ข้อความพิเศษจาก Admin' }
              ].map((pref) => (
                <div
                  key={pref.key}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-[#00A9CE] transition-colors"
                >
                  <label htmlFor={pref.key} className="font-semibold text-gray-900 cursor-pointer flex-1">
                    {pref.label}
                  </label>
                  <button
                    id={pref.key}
                    onClick={() => handlePreferenceChange(pref.key)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      preferences[pref.key] ? 'bg-[#00A9CE]' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        preferences[pref.key] ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Notification History */}
        <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
          <h2 className="text-2xl font-black text-gray-900 mb-4">
            📜 ประวัติการแจ้งเตือน
          </h2>

          {notifications.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 font-semibold">ยังไม่มีการแจ้งเตือน</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border-2 ${
                    notification.read ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">
                      {notification.read ? '✉️' : '📬'}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900">{notification.title}</h3>
                      <p className="text-sm text-gray-600 mt-1">{notification.body}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {formatTimeAgo(notification.created_at)}
                      </p>
                    </div>
                    {notification.read ? (
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default NotificationSettings;
