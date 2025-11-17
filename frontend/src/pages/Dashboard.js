import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, User, FileText, TrendingUp, Users as UsersIcon, Settings, Plus } from 'lucide-react';
import { toast } from 'sonner';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, logout, token } = useAuth();
  const [myContents, setMyContents] = useState([]);
  const [stats, setStats] = useState({ totalViews: 0, totalContent: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyContents();
  }, []);

  const fetchMyContents = async () => {
    try {
      const response = await axios.get(`${API}/content`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 100 }
      });
      const allContents = response.data;
      const myContents = allContents.filter(c => c.created_by === user.id);
      setMyContents(myContents);
      
      const totalViews = myContents.reduce((sum, c) => sum + (c.views || 0), 0);
      setStats({ totalViews, totalContent: myContents.length });
    } catch (error) {
      console.error('Error fetching contents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('ออกจากระบบสำเร็จ');
    navigate('/');
  };

  const getRoleLabel = (role) => {
    const labels = {
      admin: 'ผู้ดูแลระบบ',
      alumni: 'ศิษย์เก่า',
      current_student: 'นิสิตปัจจุบัน',
      public_user: 'ผู้ใช้ทั่วไป'
    };
    return labels[role] || role;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation Bar */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                S
              </div>
              <span className="text-xl font-bold text-gray-900">SWUMKT</span>
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate('/content')} data-testid="nav-browse-content-btn">
                <FileText className="w-4 h-4 mr-2" />
                เรียกดูเนื้อหา
              </Button>
              <Button variant="ghost" onClick={() => navigate('/profile')} data-testid="nav-profile-btn">
                <User className="w-4 h-4 mr-2" />
                โปรไฟล์
              </Button>
              <Button variant="outline" onClick={handleLogout} data-testid="logout-btn">
                <LogOut className="w-4 h-4 mr-2" />
                ออกจากระบบ
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Dashboard Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2" data-testid="dashboard-title">
            ยินดีต้อนรับ, {user?.full_name}
          </h1>
          <p className="text-gray-600">
            บทบาท: <span className="font-medium text-blue-600">{getRoleLabel(user?.role)}</span>
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 border-2 border-blue-100 hover:shadow-lg transition-shadow" data-testid="stat-card-contents">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-gray-600">เนื้อหาของฉัน</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalContent}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-2 border-green-100 hover:shadow-lg transition-shadow" data-testid="stat-card-views">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-100 text-green-600">
                <TrendingUp className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-gray-600">ยอดเข้าชมทั้งหมด</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalViews}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-2 border-purple-100 hover:shadow-lg transition-shadow" data-testid="stat-card-role">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-100 text-purple-600">
                <UsersIcon className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-gray-600">สถานะ</p>
                <p className="text-xl font-bold text-gray-900">{getRoleLabel(user?.role)}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Main Dashboard Tabs */}
        <Tabs defaultValue="content" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="content" data-testid="tab-content">เนื้อหาของฉัน</TabsTrigger>
            <TabsTrigger value="features" data-testid="tab-features">ฟีเจอร์อื่นๆ</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="mt-6" data-testid="content-tab-panel">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">เนื้อหาของฉัน</h2>
                <Button onClick={() => navigate('/content/create')} data-testid="create-content-btn" className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  สร้างเนื้อหาใหม่
                </Button>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : myContents.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">คุณยังไม่มีเนื้อหา</p>
                  <Button onClick={() => navigate('/content/create')} className="bg-blue-600 hover:bg-blue-700">
                    สร้างเนื้อหาแรกของคุณ
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {myContents.map((content, index) => (
                    <Card
                      key={content.id}
                      className="p-4 hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
                      onClick={() => navigate(`/content/${content.id}`)}
                      data-testid={`my-content-item-${index}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">{content.title}</h3>
                          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                            {content.content.substring(0, 150)}...
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>ประเภท: {content.content_type}</span>
                            <span>ยอดเข้าชม: {content.views || 0}</span>
                            <span className={`px-2 py-1 rounded-full ${
                              content.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {content.status === 'published' ? 'เผยแพร่แล้ว' : 'แบบร่าง'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="features" className="mt-6" data-testid="features-tab-panel">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 border-2 border-gray-200 opacity-60">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-gray-100 text-gray-400">
                    <TrendingUp className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-700">Market Research Tools</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  เครื่องมือวิจัยตลาดสำหรับ Survey, Conjoint Analysis, Data Visualization
                </p>
                <span className="text-sm px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                  กำลังพัฒนา
                </span>
              </Card>

              <Card className="p-6 border-2 border-gray-200 opacity-60">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-gray-100 text-gray-400">
                    <UsersIcon className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-700">Alumni Zone</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  เครือข่ายศิษย์เก่า เชื่อมต่อ และสร้างความสัมพันธ์
                </p>
                <span className="text-sm px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                  กำลังพัฒนา
                </span>
              </Card>

              <Card className="p-6 border-2 border-gray-200 opacity-60">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-gray-100 text-gray-400">
                    <Settings className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-700">External Integrations</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  เชื่อมต่อ LINE Notify, Email, SMS สำหรับแจ้งเตือน
                </p>
                <span className="text-sm px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                  กำลังพัฒนา
                </span>
              </Card>

              <Card className="p-6 border-2 border-gray-200 opacity-60">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-gray-100 text-gray-400">
                    <FileText className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-700">Advanced Analytics</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  วิเคราะห์ข้อมูลและสถิติขั้นสูงสำหรับเนื้อหา
                </p>
                <span className="text-sm px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                  กำลังพัฒนา
                </span>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;