import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { UserPlus, ArrowLeft, Mail, Lock, User, Sparkles, GraduationCap, Hash } from 'lucide-react';

const RegisterPage = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'public_user',
    student_id: '',
    graduation_year: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = { ...formData };
      if (data.graduation_year) {
        data.graduation_year = parseInt(data.graduation_year);
      }
      if (!data.student_id) {
        delete data.student_id;
      }
      if (!data.graduation_year) {
        delete data.graduation_year;
      }

      await register(data);
      toast.success('ลงทะเบียนสำเร็จ!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Register error:', error);
      toast.error(error.response?.data?.detail || 'ลงทะเบียนไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen geometric-bg flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #F5F7FA 0%, #E5E9F0 100%)' }}>
      <div className="w-full max-w-md">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          data-testid="back-to-home-btn"
          className="mb-6 text-gray-600 hover:text-[#00A9CE] hover:bg-[#00A9CE]/5"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> กลับหน้าแรก
        </Button>

        <Card className="p-8 glass-effect shadow-2xl border-2 border-[#00A9CE]/10 scale-in">
          <div className="text-center mb-8">
            <div className="relative inline-block mb-6">
              <img 
                src="https://customer-assets.emergentagent.com/job_swu-market/artifacts/ts3olfuf_MKTSWU%20Logo%20Concept%20V2%20-%20Edited.png"
                alt="SWUMKT Logo"
                className="h-20 w-auto mx-auto"
              />
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#00A9CE]/10 to-[#33BCDA]/10 rounded-full border border-[#00A9CE]/20 mb-4">
              <Sparkles className="w-4 h-4 text-[#00A9CE]" />
              <span className="text-sm font-medium text-[#007B9A]">Join Us Today</span>
            </div>
            <h1 className="text-4xl font-bold mb-2" data-testid="register-title">
              <span className="gradient-text">ลงทะเบียน</span>
            </h1>
            <p className="text-gray-600">สร้างบัญชีใหม่เพื่อเข้าใช้ SWUMKT Portal</p>
          </div>

          <form onSubmit={handleSubmit} data-testid="register-form" className="space-y-5">
            <div>
              <Label htmlFor="full_name" className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-[#00A9CE]" />
                ชื่อ-นามสกุล
              </Label>
              <Input
                id="full_name"
                type="text"
                data-testid="register-fullname-input"
                placeholder="ชื่อและนามสกุลของคุณ"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                required
                className="mt-1 h-12 border-gray-300 focus:border-[#00A9CE]"
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#00A9CE]" />
                อีเมล
              </Label>
              <Input
                id="email"
                type="email"
                data-testid="register-email-input"
                placeholder="your.email@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="mt-1 h-12 border-gray-300 focus:border-[#00A9CE]"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#00A9CE]" />
                รหัสผ่าน
              </Label>
              <Input
                id="password"
                type="password"
                data-testid="register-password-input"
                placeholder="อย่างน้อย 6 ตัวอักษร"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
                className="mt-1 h-12 border-gray-300 focus:border-[#00A9CE]"
              />
            </div>

            <div>
              <Label htmlFor="role" className="text-gray-700 font-medium mb-2">ประเภทผู้ใช้</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger className="mt-1 h-12 border-gray-300 focus:border-[#00A9CE]" data-testid="register-role-select">
                  <SelectValue placeholder="เลือกประเภท" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public_user" data-testid="role-public">ผู้สนใจทั่วไป</SelectItem>
                  <SelectItem value="current_student" data-testid="role-student">นิสิตปัจจุบัน</SelectItem>
                  <SelectItem value="alumni" data-testid="role-alumni">ศิษย์เก่า</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(formData.role === 'current_student' || formData.role === 'alumni') && (
              <div className="space-y-5 p-4 bg-[#00A9CE]/5 rounded-xl border border-[#00A9CE]/20">
                <div>
                  <Label htmlFor="student_id" className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                    <Hash className="w-4 h-4 text-[#00A9CE]" />
                    รหัสนิสิต (ถ้ามี)
                  </Label>
                  <Input
                    id="student_id"
                    type="text"
                    data-testid="register-studentid-input"
                    placeholder="6512345678"
                    value={formData.student_id}
                    onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                    className="mt-1 h-12 border-gray-300 focus:border-[#00A9CE]"
                  />
                </div>

                {formData.role === 'alumni' && (
                  <div>
                    <Label htmlFor="graduation_year" className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-[#00A9CE]" />
                      ปีที่สำเร็จการศึกษา
                    </Label>
                    <Input
                      id="graduation_year"
                      type="number"
                      data-testid="register-gradyear-input"
                      placeholder="2565"
                      value={formData.graduation_year}
                      onChange={(e) => setFormData({ ...formData, graduation_year: e.target.value })}
                      className="mt-1 h-12 border-gray-300 focus:border-[#00A9CE]"
                    />
                  </div>
                )}
              </div>
            )}

            <Button
              type="submit"
              data-testid="register-submit-btn"
              className="w-full h-12 bg-gradient-to-r from-[#007B9A] to-[#00A9CE] hover:from-[#006080] hover:to-[#008FB5] text-white font-semibold shadow-lg"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  กำลังสร้างบัญชี...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  ลงทะเบียน
                </span>
              )}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">หรือ</span>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-600">
              มีบัญชีอยู่แล้ว?{' '}
              <Link to="/login" className="text-[#00A9CE] hover:text-[#007B9A] font-semibold transition-colors" data-testid="goto-login-link">
                เข้าสู่ระบบ
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default RegisterPage;