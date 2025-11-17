import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BookOpen, Users, TrendingUp, Award, ArrowRight, Menu, X } from 'lucide-react';
import { useState } from 'react';

const LandingPage = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const features = [
    {
      icon: <TrendingUp className="w-8 h-8" />,
      title: 'Market Research Tools',
      description: 'เครื่องมือวิจัยตลาด รวมถึง Survey Builder, Conjoint Analysis และการวิเคราะห์ข้อมูล',
      status: 'เร็วๆ นี้'
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: 'Alumni Zone',
      description: 'เครือข่ายศิษย์เก่า เชื่อมต่อ แบ่งปัน และสร้างความสัมพันธ์ระหว่างศิษย์เก่า ศิษย์ปัจจุบัน',
      status: 'เร็วๆ นี้'
    },
    {
      icon: <BookOpen className="w-8 h-8" />,
      title: 'Knowledge Hub',
      description: 'เนื้อหาความรู้ ผลวิจัย ผลสำรวจ และบทความทางการตลาด ที่ผู้ใช้สามารถร่วมกันสร้างสรรค์',
      status: 'พร้อมใช้งาน'
    },
    {
      icon: <Award className="w-8 h-8" />,
      title: 'Student Services',
      description: 'บริการสำหรับนิสิตปัจจุบัน รวมถึงแหล่งข้อมูลการเรียนรู้และโอกาสพัฒนาทักษะ',
      status: 'เร็วๆ นี้'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-effect border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                S
              </div>
              <span className="text-xl font-bold text-gray-900">SWUMKT</span>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-gray-700 hover:text-blue-600 font-medium">Features</a>
              <a href="/content" className="text-gray-700 hover:text-blue-600 font-medium">Content</a>
              <Button variant="ghost" onClick={() => navigate('/login')} data-testid="nav-login-btn">
                เข้าสู่ระบบ
              </Button>
              <Button onClick={() => navigate('/register')} data-testid="nav-register-btn" className="bg-blue-600 hover:bg-blue-700">
                ลงทะเบียน
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-btn"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200" data-testid="mobile-menu">
            <div className="px-4 py-3 space-y-3">
              <a href="#features" className="block text-gray-700 hover:text-blue-600 font-medium">Features</a>
              <a href="/content" className="block text-gray-700 hover:text-blue-600 font-medium">Content</a>
              <Button variant="ghost" onClick={() => navigate('/login')} className="w-full justify-start">
                เข้าสู่ระบบ
              </Button>
              <Button onClick={() => navigate('/register')} className="w-full bg-blue-600 hover:bg-blue-700">
                ลงทะเบียน
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="fade-in">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6" data-testid="hero-title">
              SWUMKT Portal
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 mb-4 max-w-3xl mx-auto">
              แพลตฟอร์มสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ
            </p>
            <p className="text-base sm:text-lg text-gray-500 mb-8 max-w-2xl mx-auto">
              ศูนย์รวมเครื่องมือวิจัยตลาด เครือข่ายศิษย์เก่า และแหล่งความรู้ทางการตลาด
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                data-testid="hero-get-started-btn"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg rounded-xl shadow-lg hover:shadow-xl"
              >
                เริ่มต้นใช้งาน <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/content')}
                data-testid="hero-browse-content-btn"
                className="px-8 py-6 text-lg rounded-xl border-2 border-blue-600 text-blue-600 hover:bg-blue-50"
              >
                เรียกดูเนื้อหา
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-white/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" data-testid="features-title">
              ฟีเจอร์หลัก
            </h2>
            <p className="text-lg text-gray-600">ระบบและบริการที่ออกแบบมาเพื่อนักการตลาดและนิสิต</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <Card
                key={index}
                className="p-8 hover:shadow-xl transition-all duration-300 border-2 border-gray-100 hover:border-blue-200 bg-white slide-in-right"
                style={{ animationDelay: `${index * 0.1}s` }}
                data-testid={`feature-card-${index}`}
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
                    {feature.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xl font-bold text-gray-900">{feature.title}</h3>
                      <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                        {feature.status}
                      </span>
                    </div>
                    <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Card className="p-12 bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-0 shadow-2xl">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" data-testid="cta-title">
              พร้อมเริ่มต้นแล้วหรือยัง?
            </h2>
            <p className="text-lg mb-8 text-blue-100">
              เข้าร่วมชุมชน SWUMKT วันนี้ และเข้าถึงเครื่องมือและทรัพยากรที่จะช่วยพัฒนาทักษะทางการตลาดของคุณ
            </p>
            <Button
              size="lg"
              onClick={() => navigate('/register')}
              data-testid="cta-register-btn"
              className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-6 text-lg rounded-xl shadow-lg"
            >
              ลงทะเบียนฟรี
            </Button>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
              S
            </div>
            <span className="text-xl font-bold">SWUMKT</span>
          </div>
          <p className="text-gray-400 mb-4">
            สาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ
          </p>
          <p className="text-sm text-gray-500">
            © 2025 SWUMKT Portal. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;