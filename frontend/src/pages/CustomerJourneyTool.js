import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Map, Sparkles, Download, RefreshCw, BarChart, Lock, ZoomIn, ZoomOut, Maximize, Share2, Code, Copy, AlertTriangle, Edit3 } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';
import ShareJourneyMapModal from '@/components/ShareJourneyMapModal';
import mermaid from 'mermaid';

const CustomerJourneyTool = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, token, logout } = useAuth();
  const [rawData, setRawData] = useState('');
  const [researchContext, setResearchContext] = useState('');
  const [outputLanguage, setOutputLanguage] = useState('en');
  const [journeyType, setJourneyType] = useState('B');
  const [journeyStyle, setJourneyStyle] = useState('nonlinear');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExpandedModal, setIsExpandedModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharing, setSharing] = useState(false);
  const mermaidRef = useRef(null);
  const containerRef = useRef(null);
  const fullscreenRef = useRef(null);
  
  // Detect if running as standalone PWA
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                       window.navigator.standalone || 
                       document.referrer.includes('android-app://');

  useEffect(() => {
    // Initialize Mermaid
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'Inter, sans-serif'
    });
  }, []);

  // Auto-update Additional Context based on journey type and style
  useEffect(() => {
    const typeText = journeyType === 'A' 
      ? (i18n.language === 'th' ? 'แบบ A' : 'Type A')
      : (i18n.language === 'th' ? 'แบบ B' : 'Type B');
    
    const styleText = journeyStyle === 'linear'
      ? (i18n.language === 'th' ? 'แบบ linear' : 'Linear sequential flow')
      : (i18n.language === 'th' ? 'แบบ nonlinear รูปแบบซับซ้อน มีหลายเส้นทางและจุดตัดสินใจ' : 'Nonlinear with multiple paths and decision points');
    
    const contextText = `${typeText}. ${styleText}.`;
    setResearchContext(contextText);
  }, [journeyType, journeyStyle, i18n.language]);

  useEffect(() => {
    // Render mermaid diagram when result changes
    if (result && result.mermaid_code && mermaidRef.current) {
      renderMermaid();
    }
  }, [result]);

  useEffect(() => {
    // Handle mouse wheel zoom
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.max(0.3, Math.min(3, prev + delta)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const renderMermaid = async () => {
    if (mermaidRef.current && result?.mermaid_code) {
      try {
        mermaidRef.current.innerHTML = '';
        const { svg } = await mermaid.render('mermaid-diagram', result.mermaid_code);
        mermaidRef.current.innerHTML = svg;
      } catch (error) {
        console.error('Mermaid render error:', error);
        mermaidRef.current.innerHTML = `<div class="text-red-600 p-4">Error rendering diagram: ${error.message}</div>`;
      }
    }
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(3, prev + 0.2));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(0.3, prev - 0.2));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFullscreen = () => {
    // If standalone PWA, use modal instead
    if (isStandalone) {
      setIsExpandedModal(!isExpandedModal);
      if (!isExpandedModal) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
      return;
    }
    
    const elem = fullscreenRef.current;
    
    // Check if already in fullscreen
    const isCurrentlyFullscreen = 
      document.fullscreenElement || 
      document.webkitFullscreenElement || 
      document.mozFullScreenElement || 
      document.msFullscreenElement;

    if (!isCurrentlyFullscreen && elem) {
      // Enter fullscreen with vendor prefixes
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen(); // Safari
      } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen(); // Firefox
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen(); // IE/Edge
      }
      setIsFullscreen(true);
    } else {
      // Exit fullscreen with vendor prefixes
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen(); // Safari
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen(); // Firefox
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen(); // IE/Edge
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!(
        document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.mozFullScreenElement || 
        document.msFullscreenElement
      );
      setIsFullscreen(isFullscreen);
    };

    // Add event listeners for all vendor prefixes
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const handleGenerate = async () => {
    if (!rawData.trim()) {
      toast.error(t('common.error') + ': ' + t('customerJourney.dataHelp'));
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/generate-journey-map`,
        {
          raw_data: rawData,
          research_context: researchContext || null,
          target_language: outputLanguage,
          journey_type: journeyType,
          journey_style: journeyStyle
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setResult(response.data);
      toast.success(t('common.success'));
    } catch (error) {
      console.error('Journey map generation error:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate journey map');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleDownloadSVG = () => {
    const svgElement = mermaidRef.current?.querySelector('svg');
    if (svgElement) {
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'customer-journey-map.svg';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Downloaded!');
    }
  };

  const handleShareAsContent = async (formData) => {
    setSharing(true);
    try {
      const response = await axios.post(
        `${API}/journey-map/share-content`,
        {
          title: formData.title,
          research_type: formData.researchType,
          sample_size: formData.sampleSize,
          data_source: formData.dataSource,
          collection_method: formData.collectionMethod,
          research_date: formData.researchDate,
          additional_notes: formData.additionalNotes,
          mermaid_code: result.mermaid_code,
          analysis_summary: result.analysis_summary,
          raw_data: rawData,
          research_context: researchContext,
          journey_type: journeyType,
          journey_style: journeyStyle,
          output_language: outputLanguage
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success(t('common.success') + ': Content shared successfully!');
      setShowShareModal(false);
      
      // Navigate to content page
      navigate('/content');
    } catch (error) {
      console.error('Share content error:', error);
      toast.error(error.response?.data?.detail || 'Failed to share content');
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      {/* Expanded Modal for PWA */}
      {isExpandedModal && isStandalone && result && (
        <div 
          className="fixed inset-0 z-[9999] bg-white"
          style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            overflow: 'hidden'
          }}
        >
          <div className="absolute top-0 left-0 right-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between z-10">
            <h3 className="text-lg font-black text-gray-900">Customer Journey Map</h3>
            <div className="flex items-center gap-2">
              <Button onClick={handleZoomIn} variant="outline" size="sm" className="border-2 border-gray-300 p-2">
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button onClick={handleZoomOut} variant="outline" size="sm" className="border-2 border-gray-300 p-2">
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button onClick={handleResetZoom} variant="outline" size="sm" className="border-2 border-gray-300 p-2">
                <Maximize className="w-4 h-4" />
              </Button>
              <Button onClick={() => setIsExpandedModal(false)} variant="outline" size="sm" className="border-2 border-[#E63946] text-[#E63946] p-2">
                ✕
              </Button>
            </div>
          </div>
          <div 
            ref={containerRef}
            className="absolute inset-0 pt-20 overflow-hidden bg-white"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={(e) => {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.1 : 0.1;
              setZoom(prev => Math.max(0.3, Math.min(3, prev + delta)));
            }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              setIsDragging(true);
              setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
            }}
            onTouchMove={(e) => {
              if (isDragging && e.touches[0]) {
                const touch = e.touches[0];
                setPan({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y });
              }
            }}
            onTouchEnd={() => setIsDragging(false)}
          >
            <div className="absolute top-24 left-4 text-xs text-gray-500 font-semibold z-10 bg-white/90 px-2 py-1 rounded">
              {t('customerJourney.dragToPan')}
            </div>
            <div 
              ref={mermaidRef} 
              className="w-full h-full flex justify-center items-center"
              style={{ 
                cursor: isDragging ? 'grabbing' : 'grab',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: isDragging ? 'none' : 'transform 0.2s ease-out'
              }}
            ></div>
          </div>
        </div>
      )}

      <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
        {/* Navigation */}
        <div className="fixed top-0 w-full z-50">
          <Navigation />
        </div>

      {/* Main Content */}
      <div className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-12 text-center fade-in-up">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#00A9CE]/15 to-[#33BCDA]/15 rounded-full border-2 border-[#00A9CE]/30 mb-6 shadow-lg">
              <Map className="w-5 h-5 text-[#005A73]" />
              <span className="text-sm font-bold text-[#005A73]">{t('customerJourney.badge')}</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
              <span className="gradient-text">{t('customerJourney.title')}</span>
            </h1>
            <p className="text-lg text-gray-700 max-w-3xl mx-auto font-semibold">
              {t('customerJourney.subtitle')}
            </p>
          </div>

          <Tabs defaultValue="qualitative" className="w-full">
            <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-2 bg-white/98 border-2 border-gray-300 mb-8">
              <TabsTrigger value="qualitative" className="font-bold text-xs sm:text-sm">
                <span className="hidden sm:inline">{t('customerJourney.phase1')}</span>
                <span className="sm:hidden">{t('customerJourney.phase1Short')}</span>
              </TabsTrigger>
              <TabsTrigger value="quantitative" className="font-bold text-xs sm:text-sm" disabled>
                <Lock className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t('customerJourney.phase2')}</span>
                <span className="sm:hidden">{t('customerJourney.phase2Short')}</span>
              </TabsTrigger>
            </TabsList>

            {/* Phase 1: Qualitative */}
            <TabsContent value="qualitative">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                {/* Input Section */}
                <Card className="p-4 md:p-8 bg-white/98 border-2 border-gray-300 shadow-xl">
                  <h2 className="text-xl md:text-2xl font-black text-gray-900 mb-4 md:mb-6 flex items-center gap-2">
                    <FileText className="w-5 h-5 md:w-6 md:h-6 text-[#00A9CE]" />
                    <span className="hidden sm:inline">{t('customerJourney.inputTitle')}</span>
                    <span className="sm:hidden">{t('customerJourney.inputTitleShort')}</span>
                  </h2>
                  
                  <div className="space-y-6">
                    <div>
                      <Label htmlFor="rawData" className="text-gray-800 font-bold mb-2">
                        {t('customerJourney.dataLabel')}
                      </Label>
                      <p className="text-sm text-gray-600 mb-2 font-medium">
                        {t('customerJourney.dataHelp')}
                      </p>
                      <Textarea
                        id="rawData"
                        value={rawData}
                        onChange={(e) => setRawData(e.target.value)}
                        placeholder={t('customerJourney.dataPlaceholder')}
                        rows={8}
                        className="font-mono text-sm border-2 border-gray-300 focus:border-[#00A9CE]"
                      />
                    </div>

                    {/* Output Language Selection */}
                    <div>
                      <Label className="text-gray-800 font-bold mb-2 block">
                        {t('customerJourney.outputLanguageLabel')}
                      </Label>
                      <p className="text-sm text-gray-600 mb-2 font-medium">
                        {t('customerJourney.outputLanguageHelp')}
                      </p>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="outputLanguage"
                            value="th"
                            checked={outputLanguage === 'th'}
                            onChange={(e) => setOutputLanguage(e.target.value)}
                            className="w-4 h-4 text-[#00A9CE] focus:ring-[#00A9CE]"
                          />
                          <span className="text-gray-700 font-medium">{t('customerJourney.outputLanguageThai')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="outputLanguage"
                            value="en"
                            checked={outputLanguage === 'en'}
                            onChange={(e) => setOutputLanguage(e.target.value)}
                            className="w-4 h-4 text-[#00A9CE] focus:ring-[#00A9CE]"
                          />
                          <span className="text-gray-700 font-medium">{t('customerJourney.outputLanguageEnglish')}</span>
                        </label>
                      </div>
                    </div>

                    {/* Journey Type Selection */}
                    <div>
                      <Label className="text-gray-800 font-bold mb-2 block">
                        {t('customerJourney.journeyTypeLabel')}
                      </Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="journeyType"
                            value="A"
                            checked={journeyType === 'A'}
                            onChange={(e) => setJourneyType(e.target.value)}
                            className="w-4 h-4 text-[#00A9CE] focus:ring-[#00A9CE]"
                          />
                          <span className="text-gray-700 font-medium">{t('customerJourney.journeyTypeA')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="journeyType"
                            value="B"
                            checked={journeyType === 'B'}
                            onChange={(e) => setJourneyType(e.target.value)}
                            className="w-4 h-4 text-[#00A9CE] focus:ring-[#00A9CE]"
                          />
                          <span className="text-gray-700 font-medium">{t('customerJourney.journeyTypeB')}</span>
                        </label>
                      </div>
                    </div>

                    {/* Journey Style Selection */}
                    <div>
                      <Label className="text-gray-800 font-bold mb-2 block">
                        {t('customerJourney.journeyStyleLabel')}
                      </Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="journeyStyle"
                            value="linear"
                            checked={journeyStyle === 'linear'}
                            onChange={(e) => setJourneyStyle(e.target.value)}
                            className="w-4 h-4 text-[#00A9CE] focus:ring-[#00A9CE]"
                          />
                          <span className="text-gray-700 font-medium">{t('customerJourney.journeyStyleLinear')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="journeyStyle"
                            value="nonlinear"
                            checked={journeyStyle === 'nonlinear'}
                            onChange={(e) => setJourneyStyle(e.target.value)}
                            className="w-4 h-4 text-[#00A9CE] focus:ring-[#00A9CE]"
                          />
                          <span className="text-gray-700 font-medium">{t('customerJourney.journeyStyleNonlinear')}</span>
                        </label>
                      </div>
                    </div>

                    {/* Additional Context */}
                    <div>
                      <Label htmlFor="context" className="text-gray-800 font-bold mb-2">
                        {t('customerJourney.contextLabel')}
                      </Label>
                      <Textarea
                        id="context"
                        value={researchContext}
                        onChange={(e) => setResearchContext(e.target.value)}
                        placeholder={t('customerJourney.contextPlaceholder')}
                        rows={3}
                        className="border-2 border-gray-300 focus:border-[#00A9CE]"
                      />
                    </div>

                    <Button
                      onClick={handleGenerate}
                      disabled={loading || !rawData.trim()}
                      className="w-full h-12 md:h-14 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl text-base md:text-lg"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 md:w-5 md:h-5 mr-2 animate-spin" />
                          <span className="hidden sm:inline">{t('customerJourney.generating')}</span>
                          <span className="sm:hidden">{t('customerJourney.generatingShort')}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                          <span className="hidden sm:inline">{t('customerJourney.generate')}</span>
                          <span className="sm:hidden">{t('customerJourney.generateShort')}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </Card>

                {/* Result Section */}
                <Card className="p-4 md:p-8 bg-white/98 border-2 border-gray-300 shadow-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 md:mb-6 gap-3">
                    <h2 className="text-xl md:text-2xl font-black text-gray-900 flex items-center gap-2">
                      <Map className="w-5 h-5 md:w-6 md:h-6 text-[#00A9CE]" />
                      <span className="hidden sm:inline">{t('customerJourney.resultTitle')}</span>
                      <span className="sm:hidden">{t('customerJourney.resultTitleShort')}</span>
                    </h2>
                    {result && (
                      <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                        <Button
                          onClick={handleZoomIn}
                          variant="outline"
                          size="sm"
                          className="border-2 border-gray-300 p-2"
                        >
                          <ZoomIn className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={handleZoomOut}
                          variant="outline"
                          size="sm"
                          className="border-2 border-gray-300 p-2"
                        >
                          <ZoomOut className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={handleResetZoom}
                          variant="outline"
                          size="sm"
                          className="border-2 border-gray-300 p-2"
                          title={t('customerJourney.resetZoom')}
                        >
                          <Maximize className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={handleFullscreen}
                          variant="outline"
                          size="sm"
                          className="border-2 border-[#00A9CE] text-[#00A9CE] p-2"
                          title={t('customerJourney.fullscreen')}
                        >
                          {isFullscreen ? '✕' : '⛶'}
                        </Button>
                        <Button
                          onClick={handleDownloadSVG}
                          variant="outline"
                          size="sm"
                          className="border-2 border-[#00A9CE] text-[#00A9CE] hover:bg-[#00A9CE] hover:text-white font-bold"
                        >
                          <Download className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
                          <span className="hidden md:inline">{t('customerJourney.download')}</span>
                        </Button>
                        <Button
                          onClick={() => setShowShareModal(true)}
                          variant="outline"
                          size="sm"
                          className="border-2 border-[#00A9CE] text-[#00A9CE] hover:bg-[#00A9CE] hover:text-white font-bold"
                        >
                          <Share2 className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
                          <span className="hidden md:inline">{t('customerJourney.shareAsContent')}</span>
                        </Button>
                      </div>
                    )}
                  </div>

                  {!result ? (
                    <div className="flex flex-col items-center justify-center h-64 md:h-96 text-gray-400">
                      <Map className="w-16 h-16 md:w-24 md:h-24 mb-4 opacity-20" />
                      <p className="text-base md:text-lg font-semibold text-center px-4">{t('customerJourney.noResult')}</p>
                      <p className="text-xs md:text-sm text-center px-4">{t('customerJourney.noResultHelp')}</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Mermaid Diagram - Interactive */}
                      <div 
                        ref={fullscreenRef}
                        className="bg-white rounded-lg border-2 border-gray-200"
                      >
                        <div 
                          ref={containerRef}
                          className="p-4 relative overflow-hidden" 
                          style={{ minHeight: '500px' }}
                          onMouseDown={handleMouseDown}
                          onMouseMove={handleMouseMove}
                          onMouseUp={handleMouseUp}
                          onMouseLeave={handleMouseUp}
                        >
                          <div className="absolute top-2 left-2 text-xs text-gray-500 font-semibold z-10 bg-white/90 px-2 py-1 rounded">
                            {t('customerJourney.dragToPan')}
                          </div>
                          <div 
                            ref={mermaidRef} 
                            className="w-full h-full flex justify-center items-center"
                            style={{ 
                              cursor: isDragging ? 'grabbing' : 'grab', 
                              minHeight: '500px',
                              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                              transition: isDragging ? 'none' : 'transform 0.2s ease-out'
                            }}
                          ></div>
                        </div>
                      </div>

                      {/* Analysis Summary */}
                      <div className="p-4 bg-gradient-to-br from-[#00A9CE]/10 to-[#33BCDA]/10 rounded-lg border border-[#00A9CE]/20">
                        <h3 className="text-lg font-black text-gray-900 mb-2">{t('customerJourney.analysisSummary')}</h3>
                        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap font-medium">
                          {result.analysis_summary}
                        </p>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>

            {/* Phase 2: Quantitative (Placeholder) */}
            <TabsContent value="quantitative">
              <Card className="p-12 bg-white/98 border-2 border-gray-300 shadow-xl text-center">
                <div className="inline-block p-6 bg-gradient-to-br from-[#E63946]/10 to-[#F25C66]/10 rounded-2xl mb-6">
                  <Lock className="w-20 h-20 text-[#E63946]" />
                </div>
                <h2 className="text-3xl font-black text-gray-900 mb-4">
                  {t('customerJourney.phase2Title')}
                </h2>
                <p className="text-lg text-gray-700 max-w-2xl mx-auto font-semibold mb-6">
                  {t('customerJourney.phase2Description')}
                </p>
                <div className="flex items-center justify-center gap-4 text-gray-600 font-semibold">
                  <BarChart className="w-5 h-5" />
                  <span>{t('customerJourney.phase2Feature1')}</span>
                  <span>•</span>
                  <BarChart className="w-5 h-5" />
                  <span>{t('customerJourney.phase2Feature2')}</span>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        </div>

        {/* Share Modal */}
        <ShareJourneyMapModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          onShare={handleShareAsContent}
          journeyMapData={{
            analysis_summary: result?.analysis_summary,
            mermaid_code: result?.mermaid_code,
            rawData: rawData,
            researchContext: researchContext
          }}
          loading={sharing}
        />
      </div>
    </>
  );
};

export default CustomerJourneyTool;
