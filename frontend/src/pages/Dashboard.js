import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, User, FileText, TrendingUp, Users as UsersIcon, Settings, Plus } from 'lucide-react';
import { toast } from 'sonner';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const Dashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
    toast.success(t('common.success'));
    navigate('/');
  };

  const getRoleLabel = (role) => {
    const labels = {
      admin: t('auth.roles.admin'),
      alumni: t('auth.roles.alumni'),
      current_student: t('auth.roles.currentStudent'),
      public_user: t('auth.roles.publicUser')
    };
    return labels[role] || role;
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation Bar */}
      <nav className="bg-white/98 backdrop-blur-xl border-b border-gray-300/50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <img 
                src="https://customer-assets.emergentagent.com/job_swu-market/artifacts/ntstn8tz_SWUMKT%20Logo%20Concept%20-%20Edited.png"
                alt="SWUMKT Logo"
                className="h-16 w-auto"
              />
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate('/content')} data-testid="nav-browse-content-btn" className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
                <FileText className="w-4 h-4 mr-2" />
                {t('content.browse')}
              </Button>
              <Button variant="ghost" onClick={() => navigate('/profile')} data-testid="nav-profile-btn" className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
                <User className="w-4 h-4 mr-2" />
                {t('nav.profile')}
              </Button>
              <LanguageSwitcher />
              <Button variant="outline" onClick={handleLogout} data-testid="logout-btn" className="border-2 border-[#E63946] text-[#E63946] hover:bg-[#E63946] hover:text-white font-bold">
                <LogOut className="w-4 h-4 mr-2" />
                {t('nav.logout')}
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Dashboard Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8 fade-in-up">
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-2" data-testid="dashboard-title">
            {t('dashboard.welcome')}, <span className="gradient-text">{user?.full_name}</span>
          </h1>
          <p className="text-lg text-gray-700 font-semibold">
            {t('auth.userType')}: <span className="px-3 py-1 bg-gradient-to-r from-[#00A9CE]/15 to-[#33BCDA]/15 rounded-full border border-[#00A9CE]/25 text-[#005A73] font-bold">{getRoleLabel(user?.role)}</span>
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-white/98 border-2 border-[#00A9CE]/20 hover:shadow-xl transition-shadow scale-in" data-testid="stat-card-contents">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-[#00A9CE]/15 to-[#33BCDA]/15 text-[#005A73] border border-[#00A9CE]/20">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-gray-700 font-bold">{t('content.myContent')}</p>
                <p className="text-3xl font-black gradient-text">{stats.totalContent}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white/98 border-2 border-green-200 hover:shadow-xl transition-shadow scale-in" data-testid="stat-card-views" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-100 text-green-700 border border-green-200">
                <TrendingUp className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-gray-700 font-bold">{t('dashboard.totalViews')}</p>
                <p className="text-3xl font-black text-green-700">{stats.totalViews}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white/98 border-2 border-purple-200 hover:shadow-xl transition-shadow scale-in" data-testid="stat-card-role" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-100 text-purple-700 border border-purple-200">
                <UsersIcon className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-gray-700 font-bold">{t('dashboard.status')}</p>
                <p className="text-xl font-black text-purple-700">{getRoleLabel(user?.role)}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Main Dashboard Tabs */}
        <Tabs defaultValue="content" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-white/98 border-2 border-gray-300">
            <TabsTrigger value="content" data-testid="tab-content" className="font-bold">{t('content.myContent')}</TabsTrigger>
            <TabsTrigger value="features" data-testid="tab-features" className="font-bold">{t('features.other')}</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="mt-6" data-testid="content-tab-panel">
            <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-lg">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-gray-900">{t('content.myContent')}</h2>
                <Button onClick={() => navigate('/content/create')} data-testid="create-content-btn" className="bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl">
                  <Plus className="w-4 h-4 mr-2" />
                  {t('content.createNew')}
                </Button>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#00A9CE] mx-auto"></div>
                </div>
              ) : myContents.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-700 mb-4 font-semibold">{t('content.noContent')}</p>
                  <Button onClick={() => navigate('/content/create')} className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] text-white font-bold">
                    {t('content.createFirst')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {myContents.map((content, index) => (
                    <Card
                      key={content.id}
                      className="p-4 hover:shadow-lg transition-shadow cursor-pointer border-2 border-gray-300 hover:border-[#00A9CE] bg-white"
                      onClick={() => navigate(`/content/${content.id}`)}
                      data-testid={`my-content-item-${index}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 mb-1">{content.title}</h3>
                          <p className="text-sm text-gray-700 mb-2 line-clamp-2 font-medium">
                            {content.content.substring(0, 150)}...
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-600 font-semibold">
                            <span className="badge-success px-2 py-1 rounded-full">{t('content.type')}: {content.content_type}</span>
                            <span>{t('content.views')}: {content.views || 0}</span>
                            <span className={`px-2 py-1 rounded-full ${
                              content.status === 'published' ? 'badge-success' : 'badge-warning'
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
              <Card className="p-6 bg-white/95 border-2 border-gray-300 opacity-70">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-gray-200 text-gray-500">
                    <TrendingUp className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-700">Market Research Tools</h3>
                </div>
                <p className="text-gray-600 mb-4 font-medium">
                  เครื่องมือวิจัยตลาดสำหรับ Survey, Conjoint Analysis, Data Visualization
                </p>
                <span className="badge-warning text-sm px-3 py-1.5 rounded-full">
                  กำลังพัฒนา
                </span>
              </Card>

              <Card className="p-6 bg-white/95 border-2 border-gray-300 opacity-70">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-gray-200 text-gray-500">
                    <UsersIcon className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-700">Alumni Zone</h3>
                </div>
                <p className="text-gray-600 mb-4 font-medium">
                  เครือข่ายศิษย์เก่า เชื่อมต่อ แบ่งปัน และสร้างความสัมพันธ์
                </p>
                <span className="badge-warning text-sm px-3 py-1.5 rounded-full">
                  กำลังพัฒนา
                </span>
              </Card>

              <Card className="p-6 bg-white/95 border-2 border-gray-300 opacity-70">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-gray-200 text-gray-500">
                    <Settings className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-700">External Integrations</h3>
                </div>
                <p className="text-gray-600 mb-4 font-medium">
                  เชื่อมต่อ LINE Notify, Email, SMS สำหรับแจ้งเตือน
                </p>
                <span className="badge-warning text-sm px-3 py-1.5 rounded-full">
                  กำลังพัฒนา
                </span>
              </Card>

              <Card className="p-6 bg-white/95 border-2 border-gray-300 opacity-70">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-gray-200 text-gray-500">
                    <FileText className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-700">Advanced Analytics</h3>
                </div>
                <p className="text-gray-600 mb-4 font-medium">
                  วิเคราะห์ข้อมูลและสถิติขั้นสูงสำหรับเนื้อหา
                </p>
                <span className="badge-warning text-sm px-3 py-1.5 rounded-full">
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