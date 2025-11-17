import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LogIn, ArrowLeft } from 'lucide-react';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(formData.email, formData.password);
      toast.success('เข้าสู่ระบบสำเร็จ!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.response?.data?.detail || 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีกครั้ง');
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2" data-testid="login-title">
              เข้าสู่ระบบ
            </h1>
            <p className="text-gray-600">ยินดีต้อนรับกลับสู่ SWUMKT Portal</p>
          </div>

          <form onSubmit={handleSubmit} data-testid="login-form">
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">อีเมล</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="login-email-input"
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
                  data-testid="login-password-input"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="mt-1"
                />
              </div>

              <Button
                type="submit"
                data-testid="login-submit-btn"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    กำลังเข้าสู่ระบบ...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="w-4 h-4" />
                    เข้าสู่ระบบ
                  </span>
                )}
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            ยังไม่มีบัญชี?{' '}
            <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium" data-testid="goto-register-link">
              ลงทะเบียนที่นี่
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;