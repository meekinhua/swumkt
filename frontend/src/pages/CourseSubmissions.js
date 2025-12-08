import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Eye, User, Calendar, FileText, Loader2, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';

const CourseSubmissions = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [course, setCourse] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);

  useEffect(() => {
    if (user) {
      fetchSubmissions();
    }
  }, [courseId, skip, user]);

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API}/courses/${courseId}/submissions`,
        {
          params: { skip, limit },
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      setCourse(response.data.course);
      setSubmissions(response.data.submissions);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      if (error.response?.status === 403) {
        toast.error('คุณไม่มีสิทธิ์ดูงานในวิชานี้');
        navigate('/dashboard');
      } else {
        toast.error('ไม่สามารถโหลดข้อมูลงานส่งได้');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getContentTypeLabel = (type) => {
    const labels = {
      research: 'ผลวิจัย',
      survey: 'ผลสำรวจ',
      article: 'บทความ',
      news: 'ข่าวสาร'
    };
    return labels[type] || type;
  };

  if (loading && !course) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-[#00A9CE]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/settings')}
            className="mb-4 text-gray-800 hover:text-[#00A9CE]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับไปหน้า Admin Settings
          </Button>

          {course && (
            <Card className="p-6 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-500 rounded-xl">
                  <BookOpen className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-3 py-1 bg-purple-600 text-white rounded-full text-sm font-bold">
                      {course.course_code}
                    </span>
                    <h1 className="text-2xl font-black text-gray-900">
                      {course.course_name}
                    </h1>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600">
                    {course.semester && (
                      <div>
                        <span className="font-semibold">ภาคเรียน:</span> {course.semester}
                      </div>
                    )}
                    {course.academic_year && (
                      <div>
                        <span className="font-semibold">ปีการศึกษา:</span> {course.academic_year}
                      </div>
                    )}
                    {course.instructor_name && (
                      <div className="col-span-2">
                        <span className="font-semibold">อาจารย์:</span> {course.instructor_name}
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-3 text-sm font-semibold text-purple-700">
                    📊 งานที่ส่งทั้งหมด: {total} รายการ
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Submissions List */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 animate-spin text-[#00A9CE] mx-auto" />
            <p className="mt-4 text-gray-600 font-medium">กำลังโหลดงานที่ส่ง...</p>
          </div>
        ) : submissions.length === 0 ? (
          <Card className="p-12 text-center bg-white/98 border-2 border-gray-300">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-700 text-lg font-semibold">ยังไม่มีงานที่ส่งในวิชานี้</p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4">
              {submissions.map((submission) => (
                <Card
                  key={submission.id}
                  className="p-6 bg-white/98 hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-gray-300 hover:border-purple-500"
                  onClick={() => navigate(`/content/${submission.id}`)}
                >
                  <div className="flex items-start gap-4">
                    {/* Content Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 bg-[#00A9CE]/10 text-[#005A73] rounded text-xs font-bold">
                          {getContentTypeLabel(submission.content_type)}
                        </span>
                        {submission.status === 'published' && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
                            เผยแพร่แล้ว
                          </span>
                        )}
                        {submission.status === 'draft' && (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">
                            แบบร่าง
                          </span>
                        )}
                      </div>
                      
                      <h3 className="text-xl font-black text-gray-900 mb-2 line-clamp-1">
                        {submission.title}
                      </h3>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        {submission.creator_info && (
                          <div className="flex items-center gap-1">
                            <User className="w-4 h-4 text-[#00A9CE]" />
                            <span className="font-semibold">{submission.creator_info.full_name}</span>
                            {submission.creator_info.student_id && (
                              <span className="text-xs">({submission.creator_info.student_id})</span>
                            )}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4 text-[#00A9CE]" />
                          <span>{formatDate(submission.created_at)}</span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4 text-[#00A9CE]" />
                          <span>{submission.views || 0} ครั้ง</span>
                        </div>
                      </div>

                      {/* Group Members */}
                      {submission.group_members && submission.group_members.length > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-gray-500">สมาชิกกลุ่ม:</span>
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded font-semibold">
                            {submission.group_members.length + 1} คน
                          </span>
                        </div>
                      )}
                    </div>

                    {/* View Button */}
                    <Button
                      variant="outline"
                      className="border-2 border-purple-500 text-purple-600 hover:bg-purple-50 font-bold"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      ดูงาน
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {total > limit && (
              <div className="mt-6 flex justify-center gap-2">
                <Button
                  onClick={() => setSkip(Math.max(0, skip - limit))}
                  disabled={skip === 0}
                  variant="outline"
                  className="border-2 border-gray-400"
                >
                  ← ก่อนหน้า
                </Button>
                <span className="px-4 py-2 text-gray-700 font-semibold">
                  {Math.floor(skip / limit) + 1} / {Math.ceil(total / limit)}
                </span>
                <Button
                  onClick={() => setSkip(skip + limit)}
                  disabled={skip + limit >= total}
                  variant="outline"
                  className="border-2 border-gray-400"
                >
                  ถัดไป →
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CourseSubmissions;
