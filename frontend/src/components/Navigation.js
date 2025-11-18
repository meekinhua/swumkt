import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Menu, X, User, LogOut, FileText, TrendingUp, Settings, ArrowLeft, BarChart } from 'lucide-react';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const Navigation = ({ showContentButton = true, showMarketResearchButton = false, showProfileButton = true, showAdminButton = false, showBackButton = false, backButtonPath = '/market-research', showDashboardButton = false }) => {
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
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <img 
              src="https://customer-assets.emergentagent.com/job_swu-market/artifacts/ntstn8tz_SWUMKT%20Logo%20Concept%20-%20Edited.png"
              alt="SWUMKT Logo"
              className="h-16 w-auto"
            />
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden xl:flex items-center gap-4">
            {showBackButton && (
              <Button 
                variant="ghost" 
                onClick={() => navigate(backButtonPath)} 
                className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('content.back')}
              </Button>
            )}
            {showDashboardButton && (
              <Button 
                variant="ghost" 
                onClick={() => navigate('/dashboard')} 
                className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
              >
                <BarChart className="w-4 h-4 mr-2" />
                {t('nav.dashboard')}
              </Button>
            )}
            {showMarketResearchButton && (
              <Button 
                variant="ghost" 
                onClick={() => navigate('/market-research')} 
                className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                {t('nav.marketResearch')}
              </Button>
            )}
            {showContentButton && (
              <Button 
                variant="ghost" 
                onClick={() => navigate('/content')} 
                className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
              >
                <FileText className="w-4 h-4 mr-2" />
                {t('nav.content')}
              </Button>
            )}
            {showProfileButton && user && (
              <Button 
                variant="ghost" 
                onClick={() => navigate('/profile')} 
                className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
              >
                <User className="w-4 h-4 mr-2" />
                {t('nav.profile')}
              </Button>
            )}
            {showAdminButton && user && user.role === 'admin' && (
              <Button 
                variant="ghost" 
                onClick={() => navigate('/admin/settings')} 
                className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
              >
                <Settings className="w-4 h-4 mr-2" />
                Admin
              </Button>
            )}
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

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-gray-800 hover:text-[#00A9CE] transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-gradient-to-br from-[#005A73] to-[#007B9A] border-t border-white/10">
          <div className="px-4 py-6 space-y-3 max-h-[calc(100vh-5rem)] overflow-y-auto">
            {showBackButton && (
              <Button 
                variant="ghost" 
                onClick={() => { navigate(backButtonPath); setMobileMenuOpen(false); }} 
                className="w-full justify-start text-white hover:bg-white/10 font-semibold"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('content.back')}
              </Button>
            )}
            {showDashboardButton && (
              <Button 
                variant="ghost" 
                onClick={() => { navigate('/dashboard'); setMobileMenuOpen(false); }} 
                className="w-full justify-start text-white hover:bg-white/10 font-semibold"
              >
                <BarChart className="w-4 h-4 mr-2" />
                {t('nav.dashboard')}
              </Button>
            )}
            {showMarketResearchButton && (
              <Button 
                variant="ghost" 
                onClick={() => { navigate('/market-research'); setMobileMenuOpen(false); }} 
                className="w-full justify-start text-white hover:bg-white/10 font-semibold"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                {t('nav.marketResearch')}
              </Button>
            )}
            {showContentButton && (
              <Button 
                variant="ghost" 
                onClick={() => { navigate('/content'); setMobileMenuOpen(false); }} 
                className="w-full justify-start text-white hover:bg-white/10 font-semibold"
              >
                <FileText className="w-4 h-4 mr-2" />
                {t('nav.content')}
              </Button>
            )}
            {showProfileButton && user && (
              <Button 
                variant="ghost" 
                onClick={() => { navigate('/profile'); setMobileMenuOpen(false); }} 
                className="w-full justify-start text-white hover:bg-white/10 font-semibold"
              >
                <User className="w-4 h-4 mr-2" />
                {t('nav.profile')}
              </Button>
            )}
            {showAdminButton && user && user.role === 'admin' && (
              <Button 
                variant="ghost" 
                onClick={() => { navigate('/admin/settings'); setMobileMenuOpen(false); }} 
                className="w-full justify-start text-white hover:bg-white/10 font-semibold"
              >
                <Settings className="w-4 h-4 mr-2" />
                Admin
              </Button>
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
