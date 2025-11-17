import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BookOpen, Users, TrendingUp, Award, ArrowRight, Menu, X, Sparkles, Target, Network, User, LogOut } from 'lucide-react';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const LandingPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const features = [
    {
      icon: <TrendingUp className="w-8 h-8" />,
      title: t('features.marketResearch.title'),
      description: t('features.marketResearch.description'),
      status: t('features.marketResearch.status'),
      gradient: 'from-[#005A73] via-[#007B9A] to-[#00A9CE]'
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: t('features.alumni.title'),
      description: t('features.alumni.description'),
      status: t('features.alumni.status'),
      gradient: 'from-[#007B9A] via-[#00A9CE] to-[#33BCDA]'
    },
    {
      icon: <BookOpen className="w-8 h-8" />,
      title: t('features.knowledge.title'),
      description: t('features.knowledge.description'),
      status: t('features.knowledge.status'),
      gradient: 'from-[#00A9CE] via-[#33BCDA] to-[#00A9CE]',
      active: true
    },
    {
      icon: <Award className="w-8 h-8" />,
      title: t('features.students.title'),
      description: t('features.students.description'),
      status: t('features.students.status'),
      gradient: 'from-[#C62E38] via-[#E63946] to-[#F25C66]'
    }
  ];

  const stats = [
    { value: '1000+', label: t('stats.alumni'), icon: <Users className="w-6 h-6" /> },
    { value: '50+', label: t('stats.research'), icon: <Target className="w-6 h-6" /> },
    { value: '100+', label: t('stats.articles'), icon: <BookOpen className="w-6 h-6" /> },
    { value: '24/7', label: t('stats.access'), icon: <Sparkles className="w-6 h-6" /> }
  ];

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation with higher contrast */}
      <nav className="fixed top-0 w-full z-50 bg-white/98 backdrop-blur-xl border-b border-gray-300/50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <img 
                src="https://customer-assets.emergentagent.com/job_swu-market/artifacts/ntstn8tz_SWUMKT%20Logo%20Concept%20-%20Edited.png"
                alt="SWUMKT Logo"
                className="h-16 w-auto"
              />
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-gray-800 hover:text-[#00A9CE] font-semibold transition-colors accent-border pb-1">{t('nav.features')}</a>
              <a href="#stats" className="text-gray-800 hover:text-[#00A9CE] font-semibold transition-colors accent-border pb-1">{t('nav.about')}</a>
              <a href="/content" className="text-gray-800 hover:text-[#00A9CE] font-semibold transition-colors accent-border pb-1">{t('nav.content')}</a>
              <LanguageSwitcher />
              {user ? (
                <>
                  <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="nav-dashboard-btn" className="hover:bg-[#00A9CE]/10 hover:text-[#00A9CE] text-gray-800 font-semibold">
                    {t('nav.dashboard')}
                  </Button>
                  <Button variant="ghost" onClick={() => navigate('/profile')} data-testid="nav-profile-btn" className="hover:bg-[#00A9CE]/10 hover:text-[#00A9CE] text-gray-800 font-semibold">
                    <User className="w-4 h-4 mr-2" />
                    {t('nav.profile')}
                  </Button>
                  <Button variant="outline" onClick={handleLogout} data-testid="nav-logout-btn" className="border-2 border-[#E63946] text-[#E63946] hover:bg-[#E63946] hover:text-white font-bold">
                    <LogOut className="w-4 h-4 mr-2" />
                    {t('nav.logout')}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate('/login')} data-testid="nav-login-btn" className="hover:bg-[#00A9CE]/10 hover:text-[#00A9CE] text-gray-800 font-semibold">
                    {t('nav.login')}
                  </Button>
                  <Button onClick={() => navigate('/register')} data-testid="nav-register-btn" className="bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl">
                    {t('nav.register')}
                  </Button>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-gray-800 hover:text-[#00A9CE] transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-btn"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-gradient-to-br from-[#005A73] to-[#007B9A] border-t border-white/10" data-testid="mobile-menu">
            <div className="px-4 py-6 space-y-4">
              <a href="#features" className="block text-white hover:text-[#33BCDA] font-semibold transition-colors">{t('nav.features')}</a>
              <a href="#stats" className="block text-white hover:text-[#33BCDA] font-semibold transition-colors">{t('nav.about')}</a>
              <a href="/content" className="block text-white hover:text-[#33BCDA] font-semibold transition-colors">{t('nav.content')}</a>
              <div className="pt-2">
                <LanguageSwitcher />
              </div>
              <Button variant="ghost" onClick={() => navigate('/login')} className="w-full justify-start text-white hover:bg-white/10 font-semibold">
                {t('nav.login')}
              </Button>
              <Button onClick={() => navigate('/register')} className="w-full bg-white text-[#007B9A] hover:bg-gray-100 font-bold">
                {t('nav.register')}
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section with enhanced background */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        {/* Textured Background */}
        <div 
          className="absolute inset-0 opacity-8"
          style={{
            backgroundImage: 'url(https://customer-assets.emergentagent.com/job_swu-market/artifacts/mbosjg1g_Textured%20Background%20Concept.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        ></div>
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-blue-50/60 to-cyan-50/70"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center fade-in-up">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#00A9CE]/15 to-[#33BCDA]/15 rounded-full border-2 border-[#00A9CE]/30 mb-6 shadow-lg">
              <Sparkles className="w-5 h-5 text-[#005A73]" />
              <span className="text-sm font-bold text-[#005A73]">{t('landing.badge')}</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-gray-900 mb-6 leading-tight" data-testid="hero-title">
              <span className="gradient-text">{t('landing.title')}</span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-800 mb-4 max-w-3xl mx-auto font-bold">
              {t('landing.subtitle')}
            </p>
            <p className="text-base sm:text-lg text-gray-700 mb-10 max-w-2xl mx-auto font-medium">
              {t('landing.description')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                data-testid="hero-get-started-btn"
                className="bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white px-10 py-7 text-lg rounded-2xl shadow-2xl group font-bold"
              >
                {t('landing.getStarted')}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/content')}
                data-testid="hero-browse-content-btn"
                className="px-10 py-7 text-lg rounded-2xl border-3 border-[#00A9CE] text-[#005A73] hover:bg-[#00A9CE]/10 shadow-xl font-bold"
              >
                {t('landing.browseContent')}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section with better contrast */}
      <section id="stats" className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <Card
                key={index}
                className="p-6 text-center bg-white/95 hover:shadow-2xl transition-all duration-300 border-2 border-[#00A9CE]/20 scale-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex justify-center mb-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-[#00A9CE]/15 to-[#33BCDA]/15 text-[#005A73] border border-[#00A9CE]/20">
                    {stat.icon}
                  </div>
                </div>
                <p className="text-3xl font-black gradient-text mb-1">{stat.value}</p>
                <p className="text-sm text-gray-700 font-bold">{stat.label}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section with enhanced contrast */}
      <section id="features" className="py-20 px-4 relative overflow-hidden">
        {/* Background */}
        <div 
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'url(https://customer-assets.emergentagent.com/job_swu-market/artifacts/x4vt3xw8_Seamless%20Digital%20Interaction%20Abstraction.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        ></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16 fade-in-up">
            <h2 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4" data-testid="features-title">
              <span className="gradient-text">{t('features.title')}</span>
            </h2>
            <p className="text-lg text-gray-700 max-w-2xl mx-auto font-semibold">
              {t('features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <Card
                key={index}
                className={`p-8 bg-white/98 border-2 ${
                  feature.active ? 'border-[#00A9CE]' : 'border-gray-300'
                } hover:border-[#00A9CE] card-hover slide-in-right group shadow-lg`}
                style={{ animationDelay: `${index * 0.15}s` }}
                data-testid={`feature-card-${index}`}
              >
                <div className="flex items-start gap-6">
                  <div className={`p-4 rounded-2xl bg-gradient-to-br ${feature.gradient} text-white shadow-xl group-hover:scale-110 transition-transform border-2 border-white/20`}>
                    {feature.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-2xl font-black text-gray-900">{feature.title}</h3>
                      {feature.active ? (
                        <span className="badge-success text-xs px-3 py-1.5 rounded-full">
                          {feature.status}
                        </span>
                      ) : (
                        <span className="badge-warning text-xs px-3 py-1.5 rounded-full">
                          {feature.status}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 leading-relaxed font-medium">{feature.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section with strong contrast */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <Card className="relative overflow-hidden border-0 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-[#005A73] via-[#007B9A] to-[#00A9CE]"></div>
            <div className="absolute inset-0 geometric-bg opacity-10"></div>
            <div className="relative p-12 text-center text-white">
              <div className="inline-block p-4 bg-white/15 rounded-2xl backdrop-blur-sm mb-6 border border-white/20">
                <Network className="w-12 h-12" />
              </div>
              <h2 className="text-4xl sm:text-5xl font-black mb-6" data-testid="cta-title">
                {t('landing.ctaTitle')}
              </h2>
              <p className="text-xl mb-10 text-white/95 max-w-2xl mx-auto font-semibold">
                {t('landing.ctaDescription')}
              </p>
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                data-testid="cta-register-btn"
                className="bg-white text-[#005A73] hover:bg-gray-100 px-10 py-7 text-lg rounded-2xl shadow-2xl font-black"
              >
                {t('landing.ctaButton')}
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
              src="https://customer-assets.emergentagent.com/job_swu-market/artifacts/ntstn8tz_SWUMKT%20Logo%20Concept%20-%20Edited.png"
              alt="SWUMKT Logo"
              className="h-12 w-auto opacity-90"
            />
          </div>
          <p className="text-gray-300 mb-2 font-medium">
            {t('landing.footerText')}
          </p>
          <p className="text-sm text-gray-500">
            {t('landing.footerCopyright')}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;