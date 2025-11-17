import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { UserPlus, ArrowLeft } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          data-testid="back-to-home-btn"
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> กลับหน้าแรก
        </Button>

        <Card className="p-8 shadow-xl border-0 glass-effect">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">
              S
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2" data-testid="register-title">
              ลงทะเบียน
            </h1>
            <p className="text-gray-600">สร้างบัญชีใหม่เพื่อเข้าใช้ SWUMKT Portal</p>
          </div>

          <form onSubmit={handleSubmit} data-testid="register-form">
            <div className="space-y-4">
              <div>
                <Label htmlFor="full_name">ชื่อ-นามสกุล</Label>
                <Input
                  id="full_name"
                  type="text"
                  data-testid="register-fullname-input"
                  placeholder="ชื่อและนามสกุลของคุณ"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="email">อีเมล</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="register-email-input"
                  placeholder="your.email@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="password">รหัสผ่าน</Label>
                <Input
                  id="password"
                  type="password"
                  data-testid="register-password-input"
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="role">ประเภทผู้ใช้</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger className="mt-1" data-testid="register-role-select">
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
                <>
                  <div>
                    <Label htmlFor="student_id">รหัสนิสิต (ถ้ามี)</Label>
                    <Input
                      id="student_id"
                      type="text"
                      data-testid="register-studentid-input"
                      placeholder="6512345678"
                      value={formData.student_id}
                      onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  {formData.role === 'alumni' && (
                    <div>
                      <Label htmlFor="graduation_year">ปีที่สำเร็จการศึกษา</Label>
                      <Input
                        id="graduation_year"
                        type="number"
                        data-testid="register-gradyear-input"
                        placeholder="2565"
                        value={formData.graduation_year}
                        onChange={(e) => setFormData({ ...formData, graduation_year: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  )}
                </>
              )}

              <Button
                type="submit"
                data-testid="register-submit-btn"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    กำลังสร้างบัญชี...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    ลงทะเบียน
                  </span>
                )}
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            มีบัญชีอยู่แล้ว?{' '}
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium" data-testid="goto-login-link">
              เข้าสู่ระบบ
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default RegisterPage;