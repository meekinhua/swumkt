import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, User, FileText, TrendingUp, Users as UsersIcon, Settings, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';

const Dashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout, token } = useAuth();
  const [myContents, setMyContents] = useState([]);
  const [stats, setStats] = useState({ totalViews: 0, totalContent: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [contentToDelete, setContentToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [submittedAssignments, setSubmittedAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);

  useEffect(() => {
    fetchMyContents();
    fetchSubmittedAssignments();
  }, []);

  const fetchMyContents = async () => {
    setError(null);
    try {
      // Use optimized endpoint that fetches only current user's content
      const response = await axios.get(`${API}/content/my`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 50 }, // Only fetch 50 most recent items
        timeout: 30000 // 30 second timeout
      });
      
      // Handle response format
      const items = response.data.items || response.data || [];
      setMyContents(items);
      
      const totalViews = items.reduce((sum, c) => sum + (c.views || 0), 0);
      setStats({ totalViews, totalContent: items.length });
    } catch (error) {
      console.error('Error fetching contents:', error);
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmittedAssignments = async () => {
    try {
      setLoadingAssignments(true);
      
      // Fetch user's contents that have course_id
      const response = await axios.get(`${API}/content/my`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000
      });
      
      const items = response.data.items || response.data || [];
      
      // Filter only contents with course_id (submitted assignments)
      const assignments = items.filter(item => item.course_id);
      
      // Fetch course details for each assignment
      const assignmentsWithCourse = await Promise.all(
        assignments.map(async (assignment) => {
          try {
            const courseResponse = await axios.get(`${API}/courses/${assignment.course_id}`);
            return {
              ...assignment,
              course: courseResponse.data
            };
          } catch (error) {
            console.error(`Error fetching course ${assignment.course_id}:`, error);
            return {
              ...assignment,
              course: null
            };
          }
        })
      );
      
      // Group by course
      const groupedByCourse = assignmentsWithCourse.reduce((acc, item) => {
        const courseId = item.course_id;
        if (!acc[courseId]) {
          acc[courseId] = {
            course: item.course,
            assignments: []
          };
        }
        acc[courseId].assignments.push(item);
        return acc;
      }, {});
      
      setSubmittedAssignments(Object.values(groupedByCourse));
    } catch (error) {
      console.error('Error fetching submitted assignments:', error);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const handleDeleteContent = async () => {
    if (!contentToDelete) return;
    
    setDeleting(true);
    try {
      await axios.delete(`${API}/content/${contentToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      });
      toast.success('ลบเนื้อหาสำเร็จ');
      fetchMyContents(); // Reload list
    } catch (error) {
      console.error('Error deleting content:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถลบเนื้อหาได้');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setContentToDelete(null);
    }
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
      {/* Navigation */}
      <Navigation />

      {/* Dashboard Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Welcome Section */}
        <div className="mb-6 sm:mb-8 fade-in-up">
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-2" data-testid="dashboard-title">
            {t('dashboard.welcome')}, <span className="gradient-text">{user?.full_name}</span>
          </h1>
          <p className="text-sm sm:text-lg text-gray-700 font-semibold">
            {t('auth.userType')}: <span className="px-2 sm:px-3 py-1 bg-gradient-to-r from-[#00A9CE]/15 to-[#33BCDA]/15 rounded-full border border-[#00A9CE]/25 text-[#005A73] font-bold text-xs sm:text-sm">{getRoleLabel(user?.role)}</span>
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="p-4 sm:p-6 bg-white/98 border-2 border-[#00A9CE]/20 hover:shadow-xl transition-shadow scale-in" data-testid="stat-card-contents">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-xl bg-gradient-to-br from-[#00A9CE]/15 to-[#33BCDA]/15 text-[#005A73] border border-[#00A9CE]/20">
                <FileText className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-700 font-bold">{t('content.myContent')}</p>
                <p className="text-2xl sm:text-3xl font-black gradient-text">{stats.totalContent}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-6 bg-white/98 border-2 border-green-200 hover:shadow-xl transition-shadow scale-in" data-testid="stat-card-views" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-xl bg-green-100 text-green-700 border border-green-200">
                <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-700 font-bold">{t('dashboard.totalViews')}</p>
                <p className="text-2xl sm:text-3xl font-black text-green-700">{stats.totalViews}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-6 bg-white/98 border-2 border-purple-200 hover:shadow-xl transition-shadow scale-in" data-testid="stat-card-role" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-xl bg-purple-100 text-purple-700 border border-purple-200">
                <UsersIcon className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-700 font-bold">{t('dashboard.status')}</p>
                <p className="text-lg sm:text-xl font-black text-purple-700">{getRoleLabel(user?.role)}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* ZBS04 Assignments Section */}
        <ZBS04Assignments />

        {/* Submitted Assignments Summary */}
        {!loadingAssignments && submittedAssignments.length > 0 && (
          <Card className="p-6 bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-300 mb-6 sm:mb-8 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-2">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                งานที่ส่งแล้ว
              </h2>
              <span className="px-3 py-1 bg-purple-600 text-white rounded-full text-sm font-bold">
                {submittedAssignments.reduce((sum, group) => sum + group.assignments.length, 0)} งาน
              </span>
            </div>

            <div className="space-y-4">
              {submittedAssignments.map((group, idx) => (
                <Card key={idx} className="p-4 bg-white border-2 border-gray-200 hover:shadow-md transition-shadow">
                  {/* Course Header */}
                  {group.course && (
                    <div className="flex items-center justify-between mb-3 pb-3 border-b-2 border-gray-200">
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-purple-600 text-white rounded-full text-sm font-bold">
                          {group.course.course_code}
                        </span>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{group.course.course_name}</h3>
                          {(group.course.semester || group.course.instructor_name) && (
                            <p className="text-sm text-gray-600">
                              {group.course.semester && <span>{group.course.semester}</span>}
                              {group.course.semester && group.course.instructor_name && <span> • </span>}
                              {group.course.instructor_name && <span>{group.course.instructor_name}</span>}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-bold text-purple-700">
                        {group.assignments.length} งาน
                      </span>
                    </div>
                  )}

                  {/* Assignments List */}
                  <div className="space-y-2">
                    {group.assignments.slice(0, 3).map((assignment) => (
                      <div
                        key={assignment.id}
                        onClick={() => navigate(`/content/${assignment.id}`)}
                        className="flex items-center justify-between p-3 bg-gray-50 hover:bg-purple-50 rounded-lg cursor-pointer border border-gray-200 hover:border-purple-300 transition-all"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-900 truncate text-sm sm:text-base">
                            {assignment.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                            <span className={`px-2 py-0.5 rounded ${
                              assignment.status === 'published' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-yellow-100 text-yellow-700'
                            } font-semibold`}>
                              {assignment.status === 'published' ? 'เผยแพร่แล้ว' : 'แบบร่าง'}
                            </span>
                            <span>•</span>
                            <span>{assignment.views || 0} views</span>
                            {assignment.group_members && assignment.group_members.length > 0 && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                  </svg>
                                  {assignment.group_members.length + 1} คน
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    ))}
                    
                    {/* Show "View All" if more than 3 */}
                    {group.assignments.length > 3 && (
                      <Button
                        variant="ghost"
                        className="w-full text-purple-600 hover:text-purple-700 hover:bg-purple-100 font-bold text-sm"
                        onClick={() => {
                          // Scroll to content tab and filter by course
                          const contentTab = document.querySelector('[value="content"]');
                          if (contentTab) contentTab.click();
                        }}
                      >
                        ดูทั้งหมด {group.assignments.length} งาน →
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        )}

        {/* Main Dashboard Tabs */}
        <Tabs defaultValue="content" className="w-full">
          <TabsList className="grid w-full sm:max-w-md grid-cols-2 bg-white/98 border-2 border-gray-300">
            <TabsTrigger value="content" data-testid="tab-content" className="font-bold text-xs sm:text-sm">{t('content.myContent')}</TabsTrigger>
            <TabsTrigger value="features" data-testid="tab-features" className="font-bold text-xs sm:text-sm">{t('features.other')}</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="mt-4 sm:mt-6" data-testid="content-tab-panel">
            <Card className="p-4 sm:p-6 bg-white/98 border-2 border-gray-300 shadow-lg">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-black text-gray-900">{t('content.myContent')}</h2>
                <Button onClick={() => navigate('/content/create')} data-testid="create-content-btn" className="w-full sm:w-auto bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl text-sm">
                  <Plus className="w-4 h-4 mr-2" />
                  {t('content.createNew')}
                </Button>
              </div>

              {loading ? (
                <div className="text-center py-8 sm:py-12">
                  <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-4 border-[#00A9CE] mx-auto"></div>
                </div>
              ) : myContents.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <FileText className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-700 mb-4 font-semibold text-sm sm:text-base">{t('content.noContent')}</p>
                  <Button onClick={() => navigate('/content/create')} className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] text-white font-bold text-sm">
                    {t('content.createFirst')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {myContents.map((content, index) => (
                    <Card
                      key={content.id}
                      className="p-3 sm:p-4 hover:shadow-lg transition-shadow border-2 border-gray-300 hover:border-[#00A9CE] bg-white"
                      data-testid={`my-content-item-${index}`}
                    >
                      <div className="flex justify-between items-start gap-2 sm:gap-4">
                        <div 
                          className="flex-1 cursor-pointer min-w-0"
                          onClick={() => navigate(`/content/${content.id}`)}
                        >
                          <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 truncate">{content.title}</h3>
                          <p className="text-xs sm:text-sm text-gray-700 mb-2 line-clamp-2 font-medium">
                            {content.content.replace(/<[^>]*>/g, '').substring(0, 150)}...
                          </p>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-gray-600 font-semibold">
                            <span className="badge-success px-2 py-0.5 sm:py-1 rounded-full">{content.content_type}</span>
                            <span>{content.views || 0} views</span>
                            <span className={`px-2 py-0.5 sm:py-1 rounded-full ${
                              content.status === 'published' ? 'badge-success' : 'badge-warning'
                            }`}>
                              {content.status === 'published' ? t('content.published') : t('content.draft')}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContentToDelete(content);
                            setShowDeleteConfirm(true);
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0 p-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="features" className="mt-4 sm:mt-6" data-testid="features-tab-panel">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <Card 
                className="p-4 sm:p-6 bg-white/98 border-2 border-[#00A9CE]/20 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer"
                onClick={() => navigate('/market-research')}
                data-testid="market-research-card"
              >
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="p-2 sm:p-3 rounded-xl bg-gradient-to-br from-[#005A73] to-[#00A9CE] text-white">
                      <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                    <h3 className="text-base sm:text-xl font-bold text-gray-900">{t('features.marketResearch.title')}</h3>
                  </div>
                  <span className="badge-success text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-full hidden sm:inline">
                    {t('features.marketResearch.status')}
                  </span>
                </div>
                <p className="text-gray-700 mb-3 sm:mb-4 font-medium text-sm">
                  {t('features.marketResearch.description')}
                </p>
                <Button className="w-full bg-gradient-to-r from-[#005A73] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold text-sm">
                  {t('marketResearch.getStarted')}
                </Button>
              </Card>

              <Card className="p-4 sm:p-6 bg-white/95 border-2 border-gray-300 opacity-70">
                <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
                  <div className="p-2 sm:p-3 rounded-xl bg-gray-200 text-gray-500">
                    <UsersIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold text-gray-700">{t('features.alumniZone.title')}</h3>
                </div>
                <p className="text-gray-600 mb-3 sm:mb-4 font-medium text-sm">
                  {t('features.alumniZone.description')}
                </p>
                <span className="badge-warning text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-full">
                  {t('features.inDevelopment')}
                </span>
              </Card>

              <Card className="p-4 sm:p-6 bg-white/95 border-2 border-gray-300 opacity-70">
                <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
                  <div className="p-2 sm:p-3 rounded-xl bg-gray-200 text-gray-500">
                    <Settings className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold text-gray-700">{t('features.integrations.title')}</h3>
                </div>
                <p className="text-gray-600 mb-3 sm:mb-4 font-medium text-sm">
                  {t('features.integrations.description')}
                </p>
                <span className="badge-warning text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-full">
                  {t('features.inDevelopment')}
                </span>
              </Card>

              <Card className="p-4 sm:p-6 bg-white/95 border-2 border-gray-300 opacity-70">
                <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
                  <div className="p-2 sm:p-3 rounded-xl bg-gray-200 text-gray-500">
                    <FileText className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold text-gray-700">{t('features.analytics.title')}</h3>
                </div>
                <p className="text-gray-600 mb-3 sm:mb-4 font-medium text-sm">
                  {t('features.analytics.description')}
                </p>
                <span className="badge-warning text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-full">
                  {t('features.inDevelopment')}
                </span>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && contentToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="p-4 sm:p-6 max-w-md w-full bg-white">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">
              ⚠️ ยืนยันการลบเนื้อหา
            </h3>
            <p className="text-sm sm:text-base text-gray-700 mb-4 sm:mb-6">
              คุณแน่ใจหรือไม่ว่าต้องการลบเนื้อหา <strong>&quot;{contentToDelete.title}&quot;</strong>?
              <br />
              <span className="text-red-600 font-semibold">การกระทำนี้ไม่สามารถย้อนกลับได้</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Button
                onClick={handleDeleteContent}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-sm"
              >
                {deleting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    กำลังลบ...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    ยืนยันลบ
                  </span>
                )}
              </Button>
              <Button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setContentToDelete(null);
                }}
                disabled={deleting}
                variant="outline"
                className="flex-1 border-2 border-gray-400 hover:bg-gray-100 font-bold text-sm"
              >
                ยกเลิก
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Dashboard;