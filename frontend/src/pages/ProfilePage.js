import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, User } from 'lucide-react';
import { toast } from 'sonner';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    bio: user?.bio || '',
    avatar_url: user?.avatar_url || '',
    student_id: user?.student_id || '',
    graduation_year: user?.graduation_year || ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const updateData = { ...formData };
      if (updateData.graduation_year) {
        updateData.graduation_year = parseInt(updateData.graduation_year);
      }
      if (!updateData.student_id) {
        delete updateData.student_id;
      }
      if (!updateData.graduation_year) {
        delete updateData.graduation_year;
      }
      if (!updateData.bio) {
        delete updateData.bio;
      }
      if (!updateData.avatar_url) {
        delete updateData.avatar_url;
      }

      await updateProfile(updateData);
      toast.success('อัปเดตโปรไฟล์สำเร็จ');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('ไม่สามารถอัปเดตโปรไฟล์ได้');
    } finally {
      setLoading(false);
    }
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
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                S
              </div>
              <span className="text-xl font-bold text-gray-900">SWUMKT</span>
            </div>
            
            <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn">
              <ArrowLeft className="w-4 h-4 mr-2" />
              กลับ Dashboard
            </Button>
          </div>
        </div>
      </nav>

      {/* Profile Editor */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="p-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold">
              {user?.full_name.charAt(0)}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900" data-testid="profile-title">โปรไฟล์ของฉัน</h1>
              <p className="text-gray-600">{user?.email}</p>
              <span className="inline-block mt-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                {getRoleLabel(user?.role)}
              </span>
            </div>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleSubmit} data-testid="profile-form">
            <div className="space-y-6">
              <div>
                <Label htmlFor="full_name">ชื่อ-นามสกุล *</Label>
                <Input
                  id="full_name"
                  data-testid="fullname-input"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="bio">เกี่ยวกับตัว</Label>
                <Textarea
                  id="bio"
                  data-testid="bio-input"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="เล่าเกี่ยวกับตัวคุณสักนิด..."
                  rows={4}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="avatar_url">ลิงก์รูปโปรไฟล์</Label>
                <Input
                  id="avatar_url"
                  data-testid="avatar-input"
                  value={formData.avatar_url}
                  onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                  placeholder="https://example.com/avatar.jpg"
                  className="mt-1"
                />
                {formData.avatar_url && (
                  <div className="mt-2">
                    <img
                      src={formData.avatar_url}
                      alt="Avatar preview"
                      className="w-24 h-24 rounded-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              {(user?.role === 'current_student' || user?.role === 'alumni') && (
                <>
                  <div>
                    <Label htmlFor="student_id">รหัสนิสิต</Label>
                    <Input
                      id="student_id"
                      data-testid="studentid-input"
                      value={formData.student_id}
                      onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                      placeholder="6512345678"
                      className="mt-1"
                    />
                  </div>

                  {user?.role === 'alumni' && (
                    <div>
                      <Label htmlFor="graduation_year">ปีที่สำเร็จการศึกษา</Label>
                      <Input
                        id="graduation_year"
                        type="number"
                        data-testid="gradyear-input"
                        value={formData.graduation_year}
                        onChange={(e) => setFormData({ ...formData, graduation_year: e.target.value })}
                        placeholder="2565"
                        className="mt-1"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-4 pt-4">
                <Button
                  type="submit"
                  data-testid="save-profile-btn"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      กำลังบันทึก...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Save className="w-4 h-4" />
                      บันทึกการเปลี่ยนแปลง
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="cancel-btn"
                  onClick={() => navigate('/dashboard')}
                  disabled={loading}
                >
                  ยกเลิก
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default ProfilePage;