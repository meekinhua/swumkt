import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Plus, Edit, Trash2, Save, X, BookOpen, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';

const AdminCourseManagement = ({ token }) => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCourse, setEditingCourse] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [exportingCourseId, setExportingCourseId] = useState(null);
  const [formData, setFormData] = useState({
    course_code: '',
    course_name: '',
    semester: '',
    academic_year: '',
    instructor_name: '',
    description: '',
    status: 'active'
  });

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/admin/courses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCourses(response.data);
    } catch (error) {
      console.error('Error fetching courses:', error);
      toast.error('ไม่สามารถโหลดข้อมูลวิชาได้');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingCourse(null);
    setFormData({
      course_code: '',
      course_name: '',
      semester: '',
      academic_year: '',
      instructor_name: '',
      description: '',
      status: 'active'
    });
  };

  const handleEdit = (course) => {
    setEditingCourse(course.id);
    setIsCreating(false);
    setFormData({
      course_code: course.course_code,
      course_name: course.course_name,
      semester: course.semester || '',
      academic_year: course.academic_year || '',
      instructor_name: course.instructor_name || '',
      description: course.description || '',
      status: course.status
    });
  };

  const handleCancel = () => {
    setEditingCourse(null);
    setIsCreating(false);
    setFormData({
      course_code: '',
      course_name: '',
      semester: '',
      academic_year: '',
      instructor_name: '',
      description: '',
      status: 'active'
    });
  };

  const handleSave = async () => {
    if (!formData.course_code || !formData.course_name) {
      toast.error('กรุณากรอกรหัสวิชาและชื่อวิชา');
      return;
    }

    try {
      if (isCreating) {
        await axios.post(
          `${API}/admin/courses`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('✅ สร้างวิชาสำเร็จ!');
      } else {
        await axios.put(
          `${API}/admin/courses/${editingCourse}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('✅ แก้ไขวิชาสำเร็จ!');
      }
      
      await fetchCourses();
      handleCancel();
    } catch (error) {
      console.error('Error saving course:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถบันทึกข้อมูลได้');
    }
  };

  const handleDelete = async (courseId, courseName) => {
    if (!window.confirm(`ต้องการลบวิชา "${courseName}" ใช่หรือไม่?`)) {
      return;
    }

    try {
      await axios.delete(
        `${API}/admin/courses/${courseId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('✅ ลบวิชาสำเร็จ!');
      await fetchCourses();
    } catch (error) {
      console.error('Error deleting course:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถลบวิชาได้');
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Export submissions as CSV
  const handleExportSubmissions = async (courseId, courseCode) => {
    try {
      setExportingCourseId(courseId);
      toast.info('กำลังสร้างไฟล์ CSV...');
      
      const response = await axios.get(
        `${API}/courses/${courseId}/export-submissions`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${courseCode}_submissions.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('✅ ดาวน์โหลด CSV สำเร็จ!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถ Export ได้');
    } finally {
      setExportingCourseId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[#00A9CE]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#00A9CE]" />
            จัดการวิชา
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            เพิ่ม แก้ไข หรือลบวิชาที่เปิดสอน
          </p>
        </div>
        
        {!isCreating && !editingCourse && (
          <Button
            onClick={handleCreate}
            className="bg-gradient-to-r from-[#00A9CE] to-[#33BCDA] hover:from-[#008FB5] hover:to-[#00A9CE] text-white font-bold"
          >
            <Plus className="w-4 h-4 mr-2" />
            เพิ่มวิชาใหม่
          </Button>
        )}
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingCourse) && (
        <Card className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200">
          <h4 className="text-lg font-bold text-gray-900 mb-4">
            {isCreating ? '📝 เพิ่มวิชาใหม่' : '✏️ แก้ไขวิชา'}
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="text-gray-800 font-bold mb-2">รหัสวิชา *</Label>
              <Input
                value={formData.course_code}
                onChange={(e) => handleChange('course_code', e.target.value)}
                placeholder="เช่น ZBS04"
                className="border-2 border-gray-300"
                disabled={!isCreating}
              />
            </div>
            
            <div>
              <Label className="text-gray-800 font-bold mb-2">ชื่อวิชา *</Label>
              <Input
                value={formData.course_name}
                onChange={(e) => handleChange('course_name', e.target.value)}
                placeholder="เช่น Marketing Research"
                className="border-2 border-gray-300"
              />
            </div>
            
            <div>
              <Label className="text-gray-800 font-bold mb-2">ภาคเรียน</Label>
              <Input
                value={formData.semester}
                onChange={(e) => handleChange('semester', e.target.value)}
                placeholder="เช่น 1/2567"
                className="border-2 border-gray-300"
              />
            </div>
            
            <div>
              <Label className="text-gray-800 font-bold mb-2">ปีการศึกษา</Label>
              <Input
                value={formData.academic_year}
                onChange={(e) => handleChange('academic_year', e.target.value)}
                placeholder="เช่น 2567"
                className="border-2 border-gray-300"
              />
            </div>
            
            <div>
              <Label className="text-gray-800 font-bold mb-2">อาจารย์ผู้สอน</Label>
              <Input
                value={formData.instructor_name}
                onChange={(e) => handleChange('instructor_name', e.target.value)}
                placeholder="ชื่ออาจารย์"
                className="border-2 border-gray-300"
              />
            </div>
            
            <div>
              <Label className="text-gray-800 font-bold mb-2">สถานะ</Label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          
          <div className="mb-4">
            <Label className="text-gray-800 font-bold mb-2">คำอธิบาย</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="รายละเอียดวิชา (ถ้ามี)"
              rows={3}
              className="border-2 border-gray-300"
            />
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              className="flex-1 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-bold"
            >
              <Save className="w-4 h-4 mr-2" />
              บันทึก
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              className="flex-1 border-2 border-gray-400 text-gray-700 hover:bg-gray-100 font-bold"
            >
              <X className="w-4 h-4 mr-2" />
              ยกเลิก
            </Button>
          </div>
        </Card>
      )}

      {/* Courses List */}
      <div className="space-y-3">
        {courses.length === 0 ? (
          <Card className="p-8 text-center bg-gray-50 border-2 border-gray-200">
            <p className="text-gray-600 font-semibold">ยังไม่มีวิชาในระบบ</p>
          </Card>
        ) : (
          courses.map((course) => (
            <Card key={course.id} className="p-4 bg-white border-2 border-gray-200 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-3 py-1 bg-[#00A9CE]/10 text-[#005A73] rounded-full text-sm font-bold border border-[#00A9CE]/30">
                      {course.course_code}
                    </span>
                    <h4 className="text-lg font-bold text-gray-900">{course.course_name}</h4>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      course.status === 'active' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {course.status === 'active' ? '✓ Active' : 'Archived'}
                    </span>
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
                  
                  {course.description && (
                    <p className="text-sm text-gray-600 mt-2">{course.description}</p>
                  )}
                </div>
                
                <div className="flex gap-2 ml-4">
                  {!isCreating && !editingCourse && (
                    <>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`/courses/${course.id}/submissions`, '_blank');
                        }}
                        variant="outline"
                        size="sm"
                        className="border-2 border-green-500 text-green-600 hover:bg-green-50"
                        title="ดูงานที่ส่ง"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </Button>
                      <Button
                        onClick={() => handleEdit(course)}
                        variant="outline"
                        size="sm"
                        className="border-2 border-blue-500 text-blue-600 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleDelete(course.id, course.course_name)}
                        variant="outline"
                        size="sm"
                        className="border-2 border-red-500 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminCourseManagement;
