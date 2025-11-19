import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, User, LogOut, FileText, BarChart3, Users, Map, ClipboardList, TrendingUp, Sparkles, Lock, Eye, Target, CheckCircle } from 'lucide-react';
import Navigation from '@/components/Navigation';

const MarketResearch = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  const tools = [
    {
      id: 'survey-builder',
      icon: <ClipboardList className="w-16 h-16" />,
      title: 'Survey Builder',
      description: 'Create comprehensive surveys for market research, customer feedback, and data collection with advanced features',
      features: [
        'Multiple question types (Multiple Choice, Rating, Open-ended)',
        'Demographics collection with auto-fill',
        'Anonymous and authenticated responses',
        'Real-time analytics and CSV export'
      ],
      gradient: 'from-[#005A73] via-[#007B9A] to-[#00A9CE]',
      comingSoon: false,
      path: '/surveys'
    },
    {
      id: 'conjoint-analysis',
      icon: <TrendingUp className="w-16 h-16" />,
      title: t('marketResearch.conjointAnalysis.title'),
      description: t('marketResearch.conjointAnalysis.description'),
      features: [
        t('marketResearch.conjointAnalysis.feature1'),
        t('marketResearch.conjointAnalysis.feature2'),
        t('marketResearch.conjointAnalysis.feature3'),
        t('marketResearch.conjointAnalysis.feature4')
      ],
      gradient: 'from-[#007B9A] via-[#00A9CE] to-[#33BCDA]',
      comingSoon: true
    },
    {
      id: 'customer-journey',
      icon: <Map className="w-16 h-16" />,
      title: t('marketResearch.customerJourney.title'),
      description: t('marketResearch.customerJourney.description'),
      features: [
        t('marketResearch.customerJourney.feature1'),
        t('marketResearch.customerJourney.feature2'),
        t('marketResearch.customerJourney.feature3'),
        t('marketResearch.customerJourney.feature4')
      ],
      gradient: 'from-[#00A9CE] via-[#33BCDA] to-[#00A9CE]',
      comingSoon: false,
      path: '/market-research/customer-journey'
    },
    {
      id: 'segmentation',
      icon: <Users className="w-16 h-16" />,
      title: t('marketResearch.segmentation.title'),
      description: t('marketResearch.segmentation.description'),
      features: [
        t('marketResearch.segmentation.feature1'),
        t('marketResearch.segmentation.feature2'),
        t('marketResearch.segmentation.feature3'),
        t('marketResearch.segmentation.feature4')
      ],
      gradient: 'from-[#33BCDA] via-[#00A9CE] to-[#007B9A]',
      comingSoon: true
    },
    {
      id: 'customer-behavior',
      icon: <BarChart3 className="w-16 h-16" />,
      title: t('marketResearch.customerBehavior.title'),
      description: t('marketResearch.customerBehavior.description'),
      features: [
        t('marketResearch.customerBehavior.feature1'),
        t('marketResearch.customerBehavior.feature2'),
        t('marketResearch.customerBehavior.feature3'),
        t('marketResearch.customerBehavior.feature4')
      ],
      gradient: 'from-[#007B9A] via-[#005A73] to-[#00A9CE]',
      comingSoon: false,
      path: '/market-research/customer-behavior'
    },
    {
      id: 'customer-perception',
      icon: <Eye className="w-16 h-16" />,
      title: t('marketResearch.customerPerception.title'),
      description: t('marketResearch.customerPerception.description'),
      features: [
        t('marketResearch.customerPerception.feature1'),
        t('marketResearch.customerPerception.feature2'),
        t('marketResearch.customerPerception.feature3'),
        t('marketResearch.customerPerception.feature4')
      ],
      gradient: 'from-[#005A73] via-[#33BCDA] to-[#00A9CE]',
      comingSoon: false,
      path: '/market-research/customer-perception'
    },
    {
      id: 'competitor-analysis',
      icon: <Target className="w-16 h-16" />,
      title: t('marketResearch.competitorAnalysis.title'),
      description: t('marketResearch.competitorAnalysis.description'),
      features: [
        t('marketResearch.competitorAnalysis.feature1'),
        t('marketResearch.competitorAnalysis.feature2'),
        t('marketResearch.competitorAnalysis.feature3'),
        t('marketResearch.competitorAnalysis.feature4')
      ],
      gradient: 'from-[#C62E38] via-[#E63946] to-[#F25C66]',
      comingSoon: true
    }
  ];

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation */}
      <div className="fixed top-0 w-full z-50">
        <Navigation showMarketResearchButton={false} showContentButton={true} showProfileButton={true} />
      </div>

      {/* Main Content */}
      <div className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-12 fade-in-up">
            <Button
              variant="ghost"
              onClick={() => navigate('/dashboard')}
              className="mb-6 text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> {t('content.back')}
            </Button>
            
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#00A9CE]/15 to-[#33BCDA]/15 rounded-full border-2 border-[#00A9CE]/30 mb-6 shadow-lg">
                <Sparkles className="w-5 h-5 text-[#005A73]" />
                <span className="text-sm font-bold text-[#005A73]">Market Intelligence Platform</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
                <span className="gradient-text">{t('marketResearch.title')}</span>
              </h1>
              <p className="text-lg text-gray-700 max-w-3xl mx-auto font-semibold">
                {t('marketResearch.subtitle')}
              </p>
            </div>
          </div>

          {/* Research Tools Section */}
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-1 w-12 bg-gradient-to-r from-[#005A73] to-[#00A9CE] rounded-full"></div>
              <h2 className="text-2xl font-black text-gray-900">Market Research Tools</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {tools.map((tool, index) => (
              <Card 
                key={tool.id}
                className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-2 cursor-pointer relative overflow-hidden"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Coming Soon Badge */}
                {tool.comingSoon && (
                  <div className="absolute top-4 right-4 px-3 py-1.5 bg-gradient-to-r from-[#E63946] to-[#F25C66] text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    {t('features.inDevelopment')}
                  </div>
                )}
                
                {/* Icon */}
                <div className={`inline-block p-5 rounded-2xl bg-gradient-to-br ${tool.gradient} text-white mb-6 shadow-lg`}>
                  {tool.icon}
                </div>
                
                {/* Title */}
                <h3 className="text-2xl font-black text-gray-900 mb-3">
                  {tool.title}
                </h3>
                
                {/* Description */}
                <p className="text-gray-700 mb-6 font-medium leading-relaxed">
                  {tool.description}
                </p>
                
                {/* Features List */}
                <div className="space-y-3 mb-6">
                  {tool.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#00A9CE] mt-2 flex-shrink-0"></div>
                      <p className="text-sm text-gray-700 font-semibold">{feature}</p>
                    </div>
                  ))}
                </div>
                
                {/* Action Button */}
                <Button 
                  disabled={tool.comingSoon}
                  onClick={() => tool.path && navigate(tool.path)}
                  className={`w-full ${tool.comingSoon ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : `bg-gradient-to-r ${tool.gradient} hover:opacity-90`} text-white font-bold shadow-xl`}
                >
                  {tool.comingSoon ? t('marketResearch.comingSoon') : t('marketResearch.getStarted')}
                </Button>
              </Card>
            ))}
            </div>
          </div>

          {/* Academic Marketing Tools Section */}
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-1 w-12 bg-gradient-to-r from-[#6B46C1] to-[#9333EA] rounded-full"></div>
              <h2 className="text-2xl font-black text-gray-900">Academic Marketing Tools</h2>
              <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-full">สำหรับนักวิชาการ</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Journal Finder Tool */}
              <Card 
                onClick={() => navigate('/market-research/journal-finder')}
                className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-2 cursor-pointer relative overflow-hidden"
              >
                {/* Active Badge */}
                <div className="absolute top-4 right-4 px-3 py-1.5 bg-gradient-to-r from-[#00A9CE] to-[#00BCD4] text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  พร้อมใช้งาน
                </div>
                
                {/* Icon */}
                <div className="inline-block p-5 rounded-2xl bg-gradient-to-br from-[#6B46C1] via-[#7C3AED] to-[#9333EA] text-white mb-6 shadow-lg">
                  <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                
                {/* Title */}
                <h3 className="text-2xl font-black text-gray-900 mb-3">
                  Journal Finder
                </h3>
                
                {/* Description */}
                <p className="text-gray-700 mb-4 font-medium leading-relaxed">
                  ค้นหาวารสารวิชาการที่เหมาะสมสำหรับการตีพิมพ์งานวิจัยของคุณด้วย AI
                </p>
                
                {/* Features */}
                <div className="space-y-2 mb-6">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600 mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-gray-700 font-medium">Input: หัวข้อวิจัย, Abstract, Keywords</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600 mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-gray-700 font-medium">แสดง Impact Factor, Quartile (Q1-Q4)</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600 mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-gray-700 font-medium">ข้อมูล Scopus/ISI, ABDC, AJG indexed</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600 mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-gray-700 font-medium">AI-powered matching ด้วย Claude</p>
                  </div>
                </div>
                
                {/* Action Button */}
                <Button 
                  className="w-full bg-gradient-to-r from-[#6B46C1] via-[#7C3AED] to-[#9333EA] hover:from-[#5B35A1] hover:to-[#7C3AED] text-white font-bold"
                >
                  เริ่มใช้งาน
                </Button>
              </Card>

              {/* Academic Format Editor Tool */}
              <Card className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-2 cursor-pointer relative overflow-hidden">
                {/* Coming Soon Badge */}
                <div className="absolute top-4 right-4 px-3 py-1.5 bg-gradient-to-r from-[#E63946] to-[#F25C66] text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  กำลังพัฒนา
                </div>
                
                {/* Icon */}
                <div className="inline-block p-5 rounded-2xl bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A78BFA] text-white mb-6 shadow-lg">
                  <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                
                {/* Title */}
                <h3 className="text-2xl font-black text-gray-900 mb-3">
                  Academic Format Editor
                </h3>
                
                {/* Description */}
                <p className="text-gray-700 mb-4 font-medium leading-relaxed">
                  แก้ไขและจัดรูปแบบงานวิจัยให้ตรงตามมาตรฐานวารสารอัตโนมัติด้วย AI
                </p>
                
                {/* Features */}
                <div className="space-y-2 mb-6">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600 mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-gray-700 font-medium">รองรับ APA, MLA, Chicago, Harvard, IEEE</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600 mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-gray-700 font-medium">แก้ Citations, References, Headings</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600 mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-gray-700 font-medium">จัด Tables, Figures, Formatting</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600 mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-gray-700 font-medium">Copy-paste Author Guidelines และแก้ไขอัตโนมัติ</p>
                  </div>
                </div>
                
                {/* Action Button */}
                <Button 
                  disabled
                  className="w-full bg-gray-300 text-gray-500 cursor-not-allowed font-bold"
                >
                  กำลังพัฒนา
                </Button>
              </Card>
            </div>
          </div>

          {/* Info Section */}
          <Card className="mt-12 p-8 bg-gradient-to-br from-[#00A9CE]/10 to-[#33BCDA]/10 border-2 border-[#00A9CE]/30 shadow-xl">
            <div className="flex items-start gap-6">
              <div className="p-4 bg-gradient-to-br from-[#005A73] to-[#00A9CE] rounded-2xl flex-shrink-0">
                <BarChart3 className="w-10 h-10 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-gray-900 mb-3">
                  {t('marketResearch.infoTitle')}
                </h3>
                <p className="text-gray-700 font-semibold leading-relaxed mb-4">
                  {t('marketResearch.infoDescription')}
                </p>
                <div className="flex items-center gap-2 text-sm text-gray-600 font-semibold">
                  <Users className="w-4 h-4 text-[#00A9CE]" />
                  <span>{t('marketResearch.infoNote')}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MarketResearch;
