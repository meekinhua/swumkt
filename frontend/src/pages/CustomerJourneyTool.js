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
import { ArrowLeft, User, LogOut, FileText, Map, Sparkles, Download, RefreshCw, BarChart, Lock, Settings, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { toast } from 'sonner';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import mermaid from 'mermaid';
import panzoom from 'panzoom';

const CustomerJourneyTool = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, token, logout } = useAuth();
  const [rawData, setRawData] = useState('');
  const [researchContext, setResearchContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const mermaidRef = useRef(null);
  const panzoomInstance = useRef(null);

  useEffect(() => {
    // Initialize Mermaid
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'Inter, sans-serif'
    });
  }, []);

  useEffect(() => {
    // Render mermaid diagram when result changes
    if (result && result.mermaid_code && mermaidRef.current) {
      renderMermaid();
    }
  }, [result]);

  const renderMermaid = async () => {
    if (mermaidRef.current && result?.mermaid_code) {
      try {
        // Destroy previous panzoom instance
        if (panzoomInstance.current) {
          panzoomInstance.current.dispose();
          panzoomInstance.current = null;
        }
        
        mermaidRef.current.innerHTML = '';
        const { svg } = await mermaid.render('mermaid-diagram', result.mermaid_code);
        mermaidRef.current.innerHTML = svg;
        
        // Initialize panzoom on the SVG element
        const svgElement = mermaidRef.current.querySelector('svg');
        if (svgElement) {
          panzoomInstance.current = panzoom(svgElement, {
            maxZoom: 3,
            minZoom: 0.3,
            bounds: true,
            boundsPadding: 0.1,
            zoomDoubleClickSpeed: 1,
          });
        }
      } catch (error) {
        console.error('Mermaid render error:', error);
        mermaidRef.current.innerHTML = `<div class="text-red-600 p-4">Error rendering diagram: ${error.message}</div>`;
      }
    }
  };

  const handleZoomIn = () => {
    if (panzoomInstance.current) {
      panzoomInstance.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (panzoomInstance.current) {
      panzoomInstance.current.zoomOut();
    }
  };

  const handleResetZoom = () => {
    if (panzoomInstance.current) {
      panzoomInstance.current.moveTo(0, 0);
      panzoomInstance.current.zoomAbs(0, 0, 1);
    }
  };

  const handleGenerate = async () => {
    if (!rawData.trim()) {
      toast.error(t('common.error') + ': Please enter research data');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/generate-journey-map`,
        {
          raw_data: rawData,
          research_context: researchContext || null
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

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation */}
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
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate('/market-research')} className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('content.back')}
              </Button>
              <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
                {t('nav.dashboard')}
              </Button>
              {user?.role === 'admin' && (
                <Button variant="ghost" onClick={() => navigate('/admin/settings')} className="text-gray-800 font-semibold hover:text-[#E63946] hover:bg-[#E63946]/10">
                  <Settings className="w-4 h-4 mr-2" />
                  Admin
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate('/profile')} className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
                <User className="w-4 h-4 mr-2" />
                {t('nav.profile')}
              </Button>
              <LanguageSwitcher />
              <Button variant="outline" onClick={handleLogout} className="border-2 border-[#E63946] text-[#E63946] hover:bg-[#E63946] hover:text-white font-bold">
                <LogOut className="w-4 h-4 mr-2" />
                {t('nav.logout')}
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-12 text-center fade-in-up">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#00A9CE]/15 to-[#33BCDA]/15 rounded-full border-2 border-[#00A9CE]/30 mb-6 shadow-lg">
              <Map className="w-5 h-5 text-[#005A73]" />
              <span className="text-sm font-bold text-[#005A73]">AI-Powered Journey Mapping</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
              <span className="gradient-text">Customer Journey Map Tool</span>
            </h1>
            <p className="text-lg text-gray-700 max-w-3xl mx-auto font-semibold">
              Transform qualitative research into visual customer journey maps using AI
            </p>
          </div>

          <Tabs defaultValue="qualitative" className="w-full">
            <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-2 bg-white/98 border-2 border-gray-300 mb-8">
              <TabsTrigger value="qualitative" className="font-bold">
                Phase 1: Qualitative Analysis
              </TabsTrigger>
              <TabsTrigger value="quantitative" className="font-bold" disabled>
                <Lock className="w-4 h-4 mr-2" />
                Phase 2: Quantitative Validation
              </TabsTrigger>
            </TabsList>

            {/* Phase 1: Qualitative */}
            <TabsContent value="qualitative">
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Input Section */}
                <Card className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl">
                  <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2">
                    <FileText className="w-6 h-6 text-[#00A9CE]" />
                    Research Data Input
                  </h2>
                  
                  <div className="space-y-6">
                    <div>
                      <Label htmlFor="rawData" className="text-gray-800 font-bold mb-2">
                        Qualitative Research Data *
                      </Label>
                      <p className="text-sm text-gray-600 mb-2 font-medium">
                        Paste your research data: interviews, observations, customer reviews, feedback, etc.
                      </p>
                      <Textarea
                        id="rawData"
                        value={rawData}
                        onChange={(e) => setRawData(e.target.value)}
                        placeholder="Example:&#10;&#10;Interview with Customer A:&#10;'I first discovered the product through social media ads. The website was confusing to navigate...'&#10;&#10;Customer Review:&#10;'Great product but checkout process was frustrating...'&#10;&#10;Observation Notes:&#10;'Users spend average 3 minutes on homepage before leaving...'"
                        rows={12}
                        className="font-mono text-sm border-2 border-gray-300 focus:border-[#00A9CE]"
                      />
                    </div>

                    <div>
                      <Label htmlFor="context" className="text-gray-800 font-bold mb-2">
                        Additional Context (Optional)
                      </Label>
                      <Textarea
                        id="context"
                        value={researchContext}
                        onChange={(e) => setResearchContext(e.target.value)}
                        placeholder="E.g., Industry: E-commerce, Target Audience: Young adults, Research Method: In-depth interviews"
                        rows={3}
                        className="border-2 border-gray-300 focus:border-[#00A9CE]"
                      />
                    </div>

                    <Button
                      onClick={handleGenerate}
                      disabled={loading || !rawData.trim()}
                      className="w-full h-14 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl text-lg"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                          Generating Journey Map...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5 mr-2" />
                          Generate Journey Map
                        </>
                      )}
                    </Button>
                  </div>
                </Card>

                {/* Result Section */}
                <Card className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                      <Map className="w-6 h-6 text-[#00A9CE]" />
                      Journey Map Result
                    </h2>
                    {result && (
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={handleZoomIn}
                          variant="outline"
                          size="sm"
                          className="border-2 border-gray-300"
                        >
                          <ZoomIn className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={handleZoomOut}
                          variant="outline"
                          size="sm"
                          className="border-2 border-gray-300"
                        >
                          <ZoomOut className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={handleResetZoom}
                          variant="outline"
                          size="sm"
                          className="border-2 border-gray-300"
                        >
                          <Maximize className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={handleDownloadSVG}
                          variant="outline"
                          className="border-2 border-[#00A9CE] text-[#00A9CE] hover:bg-[#00A9CE] hover:text-white font-bold"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    )}
                  </div>

                  {!result ? (
                    <div className="flex flex-col items-center justify-center h-96 text-gray-400">
                      <Map className="w-24 h-24 mb-4 opacity-20" />
                      <p className="text-lg font-semibold">No journey map generated yet</p>
                      <p className="text-sm">Enter research data and click generate</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Analysis Summary */}
                      <div className="p-4 bg-gradient-to-br from-[#00A9CE]/10 to-[#33BCDA]/10 rounded-lg border border-[#00A9CE]/20">
                        <h3 className="text-lg font-black text-gray-900 mb-2">Analysis Summary</h3>
                        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap font-medium">
                          {result.analysis_summary}
                        </p>
                      </div>

                      {/* Mermaid Diagram - Interactive */}
                      <div className="p-4 bg-white rounded-lg border-2 border-gray-200 relative" style={{ minHeight: '500px' }}>
                        <div className="absolute top-2 left-2 text-xs text-gray-500 font-semibold z-10 bg-white/90 px-2 py-1 rounded">
                          💡 Drag to pan, scroll to zoom
                        </div>
                        <div 
                          ref={mermaidRef} 
                          className="w-full h-full flex justify-center items-center overflow-hidden"
                          style={{ cursor: 'grab', minHeight: '500px' }}
                        ></div>
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
                  Quantitative Validation - Coming Soon
                </h2>
                <p className="text-lg text-gray-700 max-w-2xl mx-auto font-semibold mb-6">
                  This feature will allow you to validate your journey map with quantitative surveys and add statistical data to your customer journey.
                </p>
                <div className="flex items-center justify-center gap-4 text-gray-600 font-semibold">
                  <BarChart className="w-5 h-5" />
                  <span>Survey Creation & Data Collection</span>
                  <span>•</span>
                  <BarChart className="w-5 h-5" />
                  <span>Statistical Analysis</span>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default CustomerJourneyTool;
