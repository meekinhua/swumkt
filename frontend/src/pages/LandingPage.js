import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BookOpen, Users, TrendingUp, Award, ArrowRight, Menu, X, Sparkles, Target, Network } from 'lucide-react';

const LandingPage = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const features = [
    {
      icon: <TrendingUp className="w-8 h-8" />,
      title: 'Market Research Tools',
      description: 'เครื่องมือวิจัยตลาด รวมถึง Survey Builder, Conjoint Analysis และการวิเคราะห์ข้อมูล',
      status: 'เร็วๆ นี้',
      gradient: 'from-[#007B9A] to-[#00A9CE]'
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: 'Alumni Zone',
      description: 'เครือข่ายศิษย์เก่า เชื่อมต่อ แบ่งปัน และสร้างความสัมพันธ์ระหว่างศิษย์เก่า ศิษย์ปัจจุบัน',
      status: 'เร็วๆ นี้',
      gradient: 'from-[#00A9CE] to-[#33BCDA]'
    },
    {
      icon: <BookOpen className="w-8 h-8" />,
      title: 'Knowledge Hub',
      description: 'เนื้อหาความรู้ ผลวิจัย ผลสำรวจ และบทความทางการตลาด ที่ผู้ใช้สามารถร่วมกันสร้างสรรค์',
      status: 'พร้อมใช้งาน',
      gradient: 'from-[#33BCDA] via-[#00A9CE] to-[#007B9A]',
      active: true
    },
    {
      icon: <Award className="w-8 h-8" />,
      title: 'Student Services',
      description: 'บริการสำหรับนิสิตปัจจุบัน รวมถึงแหล่งข้อมูลการเรียนรู้และโอกาสพัฒนาทักษะ',
      status: 'เร็วๆ นี้',
      gradient: 'from-[#E63946] to-[#F25C66]'
    }
  ];

  const stats = [
    { value: '1000+', label: 'ศิษย์เก่า', icon: <Users className="w-6 h-6" /> },
    { value: '50+', label: 'งานวิจัย', icon: <Target className="w-6 h-6" /> },
    { value: '100+', label: 'บทความ', icon: <BookOpen className="w-6 h-6" /> },
    { value: '24/7', label: 'เข้าถึงได้', icon: <Sparkles className="w-6 h-6" /> }
  ];

  return (
    <div className="min-h-screen geometric-bg" style={{ background: 'linear-gradient(135deg, #F5F7FA 0%, #E5E9F0 100%)' }}>
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-effect border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <img 
                src="https://customer-assets.emergentagent.com/job_swu-market/artifacts/ts3olfuf_MKTSWU%20Logo%20Concept%20V2%20-%20Edited.png"
                alt="SWUMKT Logo"
                className="h-14 w-auto"
              />
              <div>
                <span className="text-2xl font-bold bg-gradient-to-r from-[#007B9A] to-[#00A9CE] bg-clip-text text-transparent">SWUMKT</span>
                <p className="text-xs text-gray-500 font-medium">Marketing Excellence</p>
              </div>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-gray-700 hover:text-[#00A9CE] font-medium transition-colors accent-border pb-1">Features</a>
              <a href="#stats" className="text-gray-700 hover:text-[#00A9CE] font-medium transition-colors accent-border pb-1">About</a>
              <a href="/content" className="text-gray-700 hover:text-[#00A9CE] font-medium transition-colors accent-border pb-1">Content</a>
              <Button variant="ghost" onClick={() => navigate('/login')} data-testid="nav-login-btn" className="hover:bg-[#00A9CE]/10 hover:text-[#00A9CE]">
                เข้าสู่ระบบ
              </Button>
              <Button onClick={() => navigate('/register')} data-testid="nav-register-btn" className="bg-gradient-to-r from-[#007B9A] to-[#00A9CE] hover:from-[#006080] hover:to-[#008FB5] text-white shadow-lg">
                ลงทะเบียน
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-gray-700 hover:text-[#00A9CE] transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-btn"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden glass-effect-dark border-t border-white/10" data-testid="mobile-menu">
            <div className="px-4 py-6 space-y-4">
              <a href="#features" className="block text-white hover:text-[#33BCDA] font-medium transition-colors">Features</a>
              <a href="#stats" className="block text-white hover:text-[#33BCDA] font-medium transition-colors">About</a>
              <a href="/content" className="block text-white hover:text-[#33BCDA] font-medium transition-colors">Content</a>
              <Button variant="ghost" onClick={() => navigate('/login')} className="w-full justify-start text-white hover:bg-white/10">
                เข้าสู่ระบบ
              </Button>
              <Button onClick={() => navigate('/register')} className="w-full bg-gradient-to-r from-[#E63946] to-[#F25C66] hover:from-[#C62E38] hover:to-[#E63946] text-white">
                ลงทะเบียน
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section with Textured Background */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        {/* Background Image */}
        <div 
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'url(https://customer-assets.emergentagent.com/job_swu-market/artifacts/id4m16kr_Textured%20Background%20Concept.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        ></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#00A9CE]/10 to-[#33BCDA]/10 rounded-full border border-[#00A9CE]/20 mb-6">
              <Sparkles className="w-4 h-4 text-[#00A9CE]" />
              <span className="text-sm font-medium text-[#007B9A]">Marketing Innovation Platform</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight" data-testid="hero-title">
              <span className="gradient-text">SWUMKT Portal</span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-600 mb-4 max-w-3xl mx-auto font-medium">
              แพลตฟอร์มสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ
            </p>
            <p className="text-base sm:text-lg text-gray-500 mb-10 max-w-2xl mx-auto">
              ศูนย์รวมเครื่องมือวิจัยตลาด เครือข่ายศิษย์เก่า และแหล่งความรู้ทางการตลาด
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                data-testid="hero-get-started-btn"
                className="bg-gradient-to-r from-[#007B9A] to-[#00A9CE] hover:from-[#006080] hover:to-[#008FB5] text-white px-10 py-7 text-lg rounded-2xl shadow-xl group"
              >
                เริ่มต้นใช้งาน
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/content')}
                data-testid="hero-browse-content-btn"
                className="px-10 py-7 text-lg rounded-2xl border-2 border-[#00A9CE] text-[#007B9A] hover:bg-[#00A9CE]/5 shadow-lg"
              >
                เรียกดูเนื้อหา
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <Card
                key={index}
                className="p-6 text-center glass-effect hover:shadow-xl transition-all duration-300 border-2 border-[#00A9CE]/10 scale-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex justify-center mb-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-[#00A9CE]/10 to-[#33BCDA]/10 text-[#007B9A]">
                    {stat.icon}
                  </div>
                </div>
                <p className="text-3xl font-bold gradient-text mb-1">{stat.value}</p>
                <p className="text-sm text-gray-600 font-medium">{stat.label}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section with Digital Interaction Background */}
      <section id="features" className="py-20 px-4 relative overflow-hidden">
        {/* Background Image */}
        <div 
          className="absolute inset-0 opacity-3"
          style={{
            backgroundImage: 'url(https://customer-assets.emergentagent.com/job_swu-market/artifacts/gm5ryae3_Seamless%20Digital%20Interaction%20Abstraction.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        ></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16 fade-in-up">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4" data-testid="features-title">
              <span className="gradient-text">ฟีเจอร์หลัก</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              ระบบและบริการที่ออกแบบมาเพื่อนักการตลาดและนิสิต
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <Card
                key={index}
                className={`p-8 glass-effect border-2 ${
                  feature.active ? 'border-[#00A9CE]' : 'border-gray-200'
                } hover:border-[#00A9CE] card-hover slide-in-right group`}
                style={{ animationDelay: `${index * 0.15}s` }}
                data-testid={`feature-card-${index}`}
              >
                <div className="flex items-start gap-6">
                  <div className={`p-4 rounded-2xl bg-gradient-to-br ${feature.gradient} text-white shadow-lg group-hover:scale-110 transition-transform`}>
                    {feature.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-2xl font-bold text-gray-900">{feature.title}</h3>
                      {feature.active ? (
                        <span className="badge-success text-xs px-3 py-1.5 rounded-full font-semibold">
                          {feature.status}
                        </span>
                      ) : (
                        <span className="badge-warning text-xs px-3 py-1.5 rounded-full font-semibold">
                          {feature.status}
                        </span>
                      )}
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
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <Card className="relative overflow-hidden border-0 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-[#007B9A] via-[#00A9CE] to-[#33BCDA] opacity-95"></div>
            <div className="absolute inset-0 geometric-bg opacity-10"></div>
            <div className="relative p-12 text-center text-white">
              <div className="inline-block p-4 bg-white/10 rounded-2xl backdrop-blur-sm mb-6">
                <Network className="w-12 h-12" />
              </div>
              <h2 className="text-4xl sm:text-5xl font-bold mb-6" data-testid="cta-title">
                พร้อมเริ่มต้นแล้วหรือยัง?
              </h2>
              <p className="text-xl mb-10 text-white/90 max-w-2xl mx-auto">
                เข้าร่วมชุมชน SWUMKT วันนี้ และเข้าถึงเครื่องมือและทรัพยากรที่จะช่วยพัฒนาทักษะทางการตลาดของคุณ
              </p>
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                data-testid="cta-register-btn"
                className="bg-white text-[#007B9A] hover:bg-gray-100 px-10 py-7 text-lg rounded-2xl shadow-xl font-bold"
              >
                ลงทะเบียนฟรี
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gradient-to-br from-gray-900 to-gray-800 text-white py-12 px-4 relative overflow-hidden">
        <div className="absolute inset-0 geometric-bg opacity-5"></div>
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img 
              src="https://customer-assets.emergentagent.com/job_swu-market/artifacts/ts3olfuf_MKTSWU%20Logo%20Concept%20V2%20-%20Edited.png"
              alt="SWUMKT Logo"
              className="h-10 w-auto"
            />
            <span className="text-2xl font-bold">SWUMKT</span>
          </div>
          <p className="text-gray-400 mb-2">
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