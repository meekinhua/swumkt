import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LogIn, ArrowLeft, Mail, Lock, Sparkles } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <div className="w-full max-w-md">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          data-testid="back-to-home-btn"
          className="mb-6 text-gray-800 hover:text-[#00A9CE] hover:bg-[#00A9CE]/10 font-semibold"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> กลับหน้าแรก
        </Button>

        <Card className="p-8 bg-white/98 shadow-2xl border-2 border-[#00A9CE]/20 scale-in">
          <div className="text-center mb-8">
            <div className="relative inline-block mb-6">
              <img 
                src="https://customer-assets.emergentagent.com/job_swu-market/artifacts/ntstn8tz_SWUMKT%20Logo%20Concept%20-%20Edited.png"
                alt="SWUMKT Logo"
                className="h-20 w-auto mx-auto"
              />
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#00A9CE]/15 to-[#33BCDA]/15 rounded-full border-2 border-[#00A9CE]/25 mb-4">
              <Sparkles className="w-4 h-4 text-[#005A73]" />
              <span className="text-sm font-bold text-[#005A73]">Welcome Back</span>
            </div>
            <h1 className="text-4xl font-black mb-2" data-testid="login-title">
              <span className="gradient-text">เข้าสู่ระบบ</span>
            </h1>
            <p className="text-gray-700 font-semibold">ยินดีต้อนรับกลับสู่ SWUMKT Portal</p>
          </div>

          <form onSubmit={handleSubmit} data-testid="login-form" className="space-y-6">
            <div>
              <Label htmlFor="email" className="text-gray-800 font-bold mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#00A9CE]" />
                อีเมล
              </Label>
              <Input
                id="email"
                type="email"
                data-testid="login-email-input"
                placeholder="your.email@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-gray-800 font-bold mb-2 flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#00A9CE]" />
                รหัสผ่าน
              </Label>
              <Input
                id="password"
                type="password"
                data-testid="login-password-input"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
              />
            </div>

            <Button
              type="submit"
              data-testid="login-submit-btn"
              className="w-full h-12 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  กำลังเข้าสู่ระบบ...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="w-5 h-5" />
                  เข้าสู่ระบบ
                </span>
              )}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-600 font-semibold">หรือ</span>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-700 font-semibold">
              ยังไม่มีบัญชี?{' '}
              <Link to="/register" className="text-[#00A9CE] hover:text-[#005A73] font-bold transition-colors" data-testid="goto-register-link">
                ลงทะเบียนที่นี่
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;