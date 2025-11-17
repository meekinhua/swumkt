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
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation */}
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
            
            <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn" className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
              <ArrowLeft className="w-4 h-4 mr-2" />
              กลับ Dashboard
            </Button>
          </div>
        </div>
      </nav>

      {/* Profile Editor */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl fade-in-up">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#007B9A] to-[#00A9CE] flex items-center justify-center text-white text-4xl font-black border-4 border-white shadow-xl">
              {user?.full_name.charAt(0)}
            </div>
            <div>
              <h1 className="text-4xl font-black text-gray-900" data-testid="profile-title">
                <span className="gradient-text">โปรไฟล์ของฉัน</span>
              </h1>
              <p className="text-gray-700 font-semibold">{user?.email}</p>
              <span className="inline-block mt-2 px-4 py-1.5 bg-gradient-to-r from-[#00A9CE]/15 to-[#33BCDA]/15 rounded-full border-2 border-[#00A9CE]/25 text-[#005A73] text-sm font-bold">
                {getRoleLabel(user?.role)}
              </span>
            </div>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleSubmit} data-testid="profile-form">
            <div className="space-y-6">
              <div>
                <Label htmlFor="full_name" className="text-gray-800 font-bold mb-2">ชื่อ-นามสกุล *</Label>
                <Input
                  id="full_name"
                  data-testid="fullname-input"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                />
              </div>

              <div>
                <Label htmlFor="bio" className="text-gray-800 font-bold mb-2">เกี่ยวกับตัว</Label>
                <Textarea
                  id="bio"
                  data-testid="bio-input"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="เล่าเกี่ยวกับตัวคุณสักนิด..."
                  rows={4}
                  className="mt-1 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                />
              </div>

              <div>
                <Label htmlFor="avatar_url" className="text-gray-800 font-bold mb-2">ลิงก์รูปโปรไฟล์</Label>
                <Input
                  id="avatar_url"
                  data-testid="avatar-input"
                  value={formData.avatar_url}
                  onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                  placeholder="https://example.com/avatar.jpg"
                  className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                />
                {formData.avatar_url && (
                  <div className="mt-2">
                    <img
                      src={formData.avatar_url}
                      alt="Avatar preview"
                      className="w-24 h-24 rounded-full object-cover border-4 border-gray-300"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              {(user?.role === 'current_student' || user?.role === 'alumni') && (
                <div className="space-y-6 p-6 bg-[#00A9CE]/5 rounded-xl border-2 border-[#00A9CE]/20">
                  <div>
                    <Label htmlFor="student_id" className="text-gray-800 font-bold mb-2">รหัสนิสิต</Label>
                    <Input
                      id="student_id"
                      data-testid="studentid-input"
                      value={formData.student_id}
                      onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                      placeholder="6512345678"
                      className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium bg-white"
                    />
                  </div>

                  {user?.role === 'alumni' && (
                    <div>
                      <Label htmlFor="graduation_year" className="text-gray-800 font-bold mb-2">ปีที่สำเร็จการศึกษา</Label>
                      <Input
                        id="graduation_year"
                        type="number"
                        data-testid="gradyear-input"
                        value={formData.graduation_year}
                        onChange={(e) => setFormData({ ...formData, graduation_year: e.target.value })}
                        placeholder="2565"
                        className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium bg-white"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <Button
                  type="submit"
                  data-testid="save-profile-btn"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl h-12"
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
                  className="border-2 border-gray-400 text-gray-700 hover:bg-gray-100 font-bold"
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