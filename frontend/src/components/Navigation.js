import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Menu, X, User, LogOut, FileText, TrendingUp, Settings, ArrowLeft, BarChart, Bell } from 'lucide-react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import NotificationCenter from '@/components/NotificationCenter';

const Navigation = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-white/98 backdrop-blur-xl border-b border-gray-300/50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(user ? '/dashboard' : '/')}>
            <img 
              src="https://customer-assets.emergentagent.com/job_swu-market/artifacts/ntstn8tz_SWUMKT%20Logo%20Concept%20-%20Edited.png"
              alt="SWUMKT Logo"
              className="h-16 w-auto"
            />
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden xl:flex items-center gap-4">
            {user && (
              <>
                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/dashboard')} 
                  className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
                >
                  <BarChart className="w-4 h-4 mr-2" />
                  {t('nav.dashboard')}
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/market-research')} 
                  className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  {t('nav.marketResearch')}
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/content')} 
                  className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {t('nav.content')}
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/projects')} 
                  className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                  Projects
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/profile')} 
                  className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
                >
                  <User className="w-4 h-4 mr-2" />
                  {t('nav.profile')}
                </Button>
                {user.role === 'admin' && (
                  <>
                    <Button 
                      variant="ghost" 
                      onClick={() => navigate('/admin/settings')} 
                      className="text-purple-700 font-semibold hover:text-purple-600 hover:bg-purple-50 border-2 border-transparent hover:border-purple-300"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Admin Settings
                    </Button>
                  </>
                )}
              </>
            )}
            <NotificationCenter />
            <LanguageSwitcher />
            {user ? (
              <Button 
                onClick={handleLogout} 
                className="bg-gradient-to-r from-[#C62E38] to-[#E63946] hover:from-[#A52530] hover:to-[#C62E38] text-white font-bold shadow-xl"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {t('nav.logout')}
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/login')} className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
                  {t('nav.login')}
                </Button>
                <Button onClick={() => navigate('/register')} className="bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl">
                  {t('nav.register')}
                </Button>
              </>
            )}
          </div>

          {/* Mobile Notification & Menu */}
          <div className="xl:hidden flex items-center gap-2">
            {user && <NotificationCenter />}
            <button
              className="p-2 text-gray-800 hover:text-[#00A9CE] transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden bg-gradient-to-br from-[#005A73] to-[#007B9A] border-t border-white/10">
          <div className="px-4 py-6 space-y-3 max-h-[calc(100vh-5rem)] overflow-y-auto">
            {user && (
              <>
                <Button 
                  variant="ghost" 
                  onClick={() => { navigate('/dashboard'); setMobileMenuOpen(false); }} 
                  className="w-full justify-start text-white hover:bg-white/10 font-semibold"
                >
                  <BarChart className="w-4 h-4 mr-2" />
                  {t('nav.dashboard')}
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => { navigate('/market-research'); setMobileMenuOpen(false); }} 
                  className="w-full justify-start text-white hover:bg-white/10 font-semibold"
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  {t('nav.marketResearch')}
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => { navigate('/content'); setMobileMenuOpen(false); }} 
                  className="w-full justify-start text-white hover:bg-white/10 font-semibold"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {t('nav.content')}
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => { navigate('/projects'); setMobileMenuOpen(false); }} 
                  className="w-full justify-start text-white hover:bg-white/10 font-semibold"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                  Projects
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => { navigate('/profile'); setMobileMenuOpen(false); }} 
                  className="w-full justify-start text-white hover:bg-white/10 font-semibold"
                >
                  <User className="w-4 h-4 mr-2" />
                  {t('nav.profile')}
                </Button>
                {/* Notification Settings Link */}
                <Button 
                  variant="ghost" 
                  onClick={() => { navigate('/profile/notifications'); setMobileMenuOpen(false); }} 
                  className="w-full justify-start text-white hover:bg-white/10 font-semibold border-t-2 border-white/20 pt-4 mt-2"
                >
                  <Bell className="w-4 h-4 mr-2" />
                  {t('notifications.settings') || 'การตั้งค่าการแจ้งเตือน'}
                </Button>
                {user.role === 'admin' && (
                  <Button 
                    variant="ghost" 
                    onClick={() => { navigate('/admin/settings'); setMobileMenuOpen(false); }} 
                    className="w-full justify-start text-yellow-300 hover:bg-white/10 font-bold pt-2"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    🔐 Admin Zone
                  </Button>
                )}
              </>
            )}
            <div className="pt-2 pb-2">
              <LanguageSwitcher />
            </div>
            {user ? (
              <Button 
                onClick={handleLogout} 
                variant="outline" 
                className="w-full border-2 border-white text-white hover:bg-white hover:text-[#007B9A] font-bold"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {t('nav.logout')}
              </Button>
            ) : (
              <>
                <Button 
                  variant="ghost" 
                  onClick={() => { navigate('/login'); setMobileMenuOpen(false); }} 
                  className="w-full justify-start text-white hover:bg-white/10 font-semibold"
                >
                  {t('nav.login')}
                </Button>
                <Button 
                  onClick={() => { navigate('/register'); setMobileMenuOpen(false); }} 
                  className="w-full bg-white text-[#007B9A] hover:bg-gray-100 font-bold"
                >
                  {t('nav.register')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation;
