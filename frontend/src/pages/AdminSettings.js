import React, { useState, useEffect } from 'react';
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
import { ArrowLeft, User, LogOut, Settings, Save, RefreshCw, Shield, Map, BarChart3, Upload, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';

const AdminSettings = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, token, logout } = useAuth();
  
  // Journey Map Prompt
  const [journeyPrompt, setJourneyPrompt] = useState('');
  const [journeyMetadata, setJourneyMetadata] = useState(null);
  const [savingJourney, setSavingJourney] = useState(false);
  
  // Behavior Analysis Prompt
  const [behaviorPrompt, setBehaviorPrompt] = useState('');
  const [behaviorMetadata, setBehaviorMetadata] = useState(null);
  const [savingBehavior, setSavingBehavior] = useState(false);
  
  // Behavior Image Model
  const [imageModel, setImageModel] = useState('openai');
  const [imageModelMetadata, setImageModelMetadata] = useState(null);
  const [savingImageModel, setSavingImageModel] = useState(false);
  
  // Behavior Image Prompt
  const [imagePrompt, setImagePrompt] = useState('');
  const [imagePromptMetadata, setImagePromptMetadata] = useState(null);
  const [savingImagePrompt, setSavingImagePrompt] = useState(false);
  
  // Perception Analysis Prompt
  const [perceptionPrompt, setPerceptionPrompt] = useState('');
  const [perceptionMetadata, setPerceptionMetadata] = useState(null);
  const [savingPerception, setSavingPerception] = useState(false);
  
  // Perception Question Prompt
  const [perceptionQuestionPrompt, setPerceptionQuestionPrompt] = useState('');
  const [perceptionQuestionMetadata, setPerceptionQuestionMetadata] = useState(null);
  const [savingPerceptionQuestion, setSavingPerceptionQuestion] = useState(false);
  
  // Image Playground
  const [testPrompt, setTestPrompt] = useState('');
  const [testImage, setTestImage] = useState(null);
  const [testImagePreview, setTestImagePreview] = useState(null);
  const [generatedTestImage, setGeneratedTestImage] = useState(null);
  const [generatingTest, setGeneratingTest] = useState(false);
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'admin') {
      toast.error('Admin access required');
      navigate('/dashboard');
      return;
    }
    fetchAllSettings();
  }, [user]);

  const fetchAllSettings = async () => {
    try {
      // Fetch Journey Map prompt
      const journeyResponse = await axios.get(`${API}/admin/journey-map-prompt`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJourneyPrompt(journeyResponse.data.journey_map_prompt);
      setJourneyMetadata({
        updated_by: journeyResponse.data.updated_by,
        updated_at: journeyResponse.data.updated_at
      });

      // Fetch Behavior Analysis prompt
      const behaviorResponse = await axios.get(`${API}/admin/behavior-prompt`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBehaviorPrompt(behaviorResponse.data.behavior_prompt);
      setBehaviorMetadata({
        updated_by: behaviorResponse.data.updated_by,
        updated_at: behaviorResponse.data.updated_at
      });

      // Fetch Behavior Image Model
      const imageModelResponse = await axios.get(`${API}/admin/behavior-image-model`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImageModel(imageModelResponse.data.image_model);
      setImageModelMetadata({
        updated_by: imageModelResponse.data.updated_by,
        updated_at: imageModelResponse.data.updated_at
      });

      // Fetch Behavior Image Prompt
      const imagePromptResponse = await axios.get(`${API}/admin/behavior-image-prompt`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImagePrompt(imagePromptResponse.data.behavior_image_prompt);
      setImagePromptMetadata({
        updated_by: imagePromptResponse.data.updated_by,
        updated_at: imagePromptResponse.data.updated_at
      });

      // Fetch Perception Analysis prompt
      const perceptionResponse = await axios.get(`${API}/admin/perception-prompt`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPerceptionPrompt(perceptionResponse.data.prompt || '');

      // Fetch Perception Question prompt
      const perceptionQuestionResponse = await axios.get(`${API}/admin/perception-question-prompt`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPerceptionQuestionPrompt(perceptionQuestionResponse.data.prompt || '');
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveJourney = async () => {
    setSavingJourney(true);
    try {
      await axios.post(
        `${API}/admin/journey-map-prompt`,
        {
          journey_map_prompt: journeyPrompt
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success('Journey Map prompt saved successfully');
      fetchAllSettings();
    } catch (error) {
      console.error('Error saving journey prompt:', error);
      toast.error('Failed to save Journey Map prompt');
    } finally {
      setSavingJourney(false);
    }
  };

  const handleSaveBehavior = async () => {
    setSavingBehavior(true);
    try {
      await axios.post(
        `${API}/admin/behavior-prompt`,
        {
          behavior_prompt: behaviorPrompt
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success('Behavior Analysis prompt saved successfully');
      fetchAllSettings();
    } catch (error) {
      console.error('Error saving behavior prompt:', error);
      toast.error('Failed to save Behavior Analysis prompt');
    } finally {
      setSavingBehavior(false);
    }
  };

  const handleSaveImageModel = async () => {
    setSavingImageModel(true);
    try {
      await axios.post(
        `${API}/admin/behavior-image-model`,
        {
          image_model: imageModel
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success(`Image model updated to ${imageModel.toUpperCase()} successfully`);
      fetchAllSettings();
    } catch (error) {
      console.error('Error saving image model:', error);
      toast.error('Failed to save image model setting');
    } finally {
      setSavingImageModel(false);
    }
  };

  const handleSaveImagePrompt = async () => {
    setSavingImagePrompt(true);
    try {
      await axios.post(
        `${API}/admin/behavior-image-prompt`,
        {
          behavior_image_prompt: imagePrompt
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success('Image generation prompt saved successfully');
      fetchAllSettings();
    } catch (error) {
      console.error('Error saving image prompt:', error);
      toast.error('Failed to save image prompt');
    } finally {
      setSavingImagePrompt(false);
    }
  };

  const handleSavePerceptionPrompt = async () => {
    setSavingPerception(true);
    try {
      await axios.post(
        `${API}/admin/perception-prompt`,
        { prompt: perceptionPrompt },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Perception analysis prompt saved successfully');
      fetchAllSettings();
    } catch (error) {
      console.error('Error saving perception prompt:', error);
      toast.error('Failed to save perception prompt');
    } finally {
      setSavingPerception(false);
    }
  };

  const handleSavePerceptionQuestionPrompt = async () => {
    setSavingPerceptionQuestion(true);
    try {
      await axios.post(
        `${API}/admin/perception-question-prompt`,
        { prompt: perceptionQuestionPrompt },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Perception question prompt saved successfully');
      fetchAllSettings();
    } catch (error) {
      console.error('Error saving perception question prompt:', error);
      toast.error('Failed to save perception question prompt');
    } finally {
      setSavingPerceptionQuestion(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-12 h-12 animate-spin text-[#00A9CE]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation */}
      <div className="fixed top-0 w-full z-50">
        <Navigation showBackButton={true} backButtonPath="/dashboard" showMarketResearchButton={true} showContentButton={true} showProfileButton={true} showAdminButton={false} />
      </div>

      {/* Main Content */}
      <div className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-12 text-center fade-in-up">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#E63946]/15 to-[#F25C66]/15 rounded-full border-2 border-[#E63946]/30 mb-6 shadow-lg">
              <Shield className="w-5 h-5 text-[#E63946]" />
              <span className="text-sm font-bold text-[#E63946]">Admin Only</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
              <span className="gradient-text">Admin Settings</span>
            </h1>
            <p className="text-lg text-gray-700 max-w-3xl mx-auto font-semibold">
              Configure AI prompts and system settings
            </p>
          </div>

          {/* Settings Card with Tabs */}
          <Card className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="w-8 h-8 text-[#00A9CE]" />
              <h2 className="text-2xl font-black text-gray-900">
                AI Prompt Configuration
              </h2>
            </div>

            <Tabs defaultValue="journey" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-6">
                <TabsTrigger value="journey" className="flex items-center gap-2">
                  <Map className="w-4 h-4" />
                  Journey Map
                </TabsTrigger>
                <TabsTrigger value="behavior" className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Behavior Analysis
                </TabsTrigger>
                <TabsTrigger value="perception" className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Perception Analysis
                </TabsTrigger>
                <TabsTrigger value="image" className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Image Generation
                </TabsTrigger>
              </TabsList>

              {/* Journey Map Prompt Tab */}
              <TabsContent value="journey">
                {journeyMetadata && journeyMetadata.updated_at && (
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-gray-700 font-semibold">
                      <strong>Last Updated:</strong> {new Date(journeyMetadata.updated_at).toLocaleString()} by {journeyMetadata.updated_by}
                    </p>
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <Label htmlFor="journey-prompt" className="text-gray-800 font-bold mb-2 text-lg">
                      System Prompt for Journey Map Generation
                    </Label>
                    <p className="text-sm text-gray-600 mb-4 font-medium">
                      This prompt will be used by the AI to analyze qualitative research data and generate customer journey maps. 
                      Include guidelines, output format, and Mermaid diagram examples.
                    </p>
                    <Textarea
                      id="journey-prompt"
                      value={journeyPrompt}
                      onChange={(e) => setJourneyPrompt(e.target.value)}
                      rows={20}
                      className="font-mono text-sm border-2 border-gray-300 focus:border-[#00A9CE]"
                      placeholder="Enter the system prompt for AI..."
                    />
                    <p className="text-xs text-gray-500 mt-2 font-medium">
                      💡 Tip: Include instructions for identifying stages, touchpoints, pain points, and Mermaid diagram formatting.
                    </p>
                  </div>

                  <div className="flex gap-4">
                    <Button
                      onClick={handleSaveJourney}
                      disabled={savingJourney || !journeyPrompt.trim()}
                      className="flex-1 h-14 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl text-lg"
                    >
                      {savingJourney ? (
                        <>
                          <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5 mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={() => navigate('/market-research/customer-journey')}
                      variant="outline"
                      className="border-2 border-[#00A9CE] text-[#00A9CE] hover:bg-[#00A9CE] hover:text-white font-bold"
                    >
                      Test in Journey Tool
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Behavior Analysis Prompt Tab */}
              <TabsContent value="behavior">
                {behaviorMetadata && behaviorMetadata.updated_at && (
                  <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm text-gray-700 font-semibold">
                      <strong>Last Updated:</strong> {new Date(behaviorMetadata.updated_at).toLocaleString()} by {behaviorMetadata.updated_by}
                    </p>
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <Label htmlFor="behavior-prompt" className="text-gray-800 font-bold mb-2 text-lg">
                      System Prompt for Behavior Analysis
                    </Label>
                    <p className="text-sm text-gray-600 mb-4 font-medium">
                      This prompt will be used by the AI to analyze customer behavior patterns from qualitative research data.
                      Include guidelines for identifying behavioral patterns, motivations, and actionable recommendations.
                    </p>
                    <Textarea
                      id="behavior-prompt"
                      value={behaviorPrompt}
                      onChange={(e) => setBehaviorPrompt(e.target.value)}
                      rows={20}
                      className="font-mono text-sm border-2 border-gray-300 focus:border-[#00A9CE]"
                      placeholder="Enter the system prompt for behavior analysis..."
                    />
                    <p className="text-xs text-gray-500 mt-2 font-medium">
                      💡 Tip: Include instructions for identifying purchase behaviors, usage patterns, decision-making processes, and psychological factors.
                    </p>
                  </div>

                  {/* Image Model Selection */}
                  <div>
                    <Label className="text-gray-800 font-bold mb-2 text-lg">
                      Image Generation Model
                    </Label>
                    {imageModelMetadata && imageModelMetadata.updated_at && (
                      <div className="mb-3 p-3 bg-green-50 rounded border border-green-200 text-xs">
                        <p className="text-gray-700 font-semibold">
                          <strong>Last Updated:</strong> {new Date(imageModelMetadata.updated_at).toLocaleString()} by {imageModelMetadata.updated_by}
                        </p>
                      </div>
                    )}
                    <p className="text-sm text-gray-600 mb-4 font-medium">
                      Choose which AI model to use for generating behavior analysis illustrations
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* OpenAI Option */}
                      <div
                        onClick={() => setImageModel('openai')}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          imageModel === 'openai'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="imageModel"
                            value="openai"
                            checked={imageModel === 'openai'}
                            onChange={(e) => setImageModel(e.target.value)}
                            className="mt-1"
                          />
                          <div>
                            <h4 className="font-bold text-gray-900">OpenAI (DALL-E)</h4>
                            <p className="text-sm text-gray-600 mt-1">
                              Model: gpt-image-1
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              High-quality photorealistic images with detailed control
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Gemini Option */}
                      <div
                        onClick={() => setImageModel('gemini')}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          imageModel === 'gemini'
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-300 hover:border-green-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="imageModel"
                            value="gemini"
                            checked={imageModel === 'gemini'}
                            onChange={(e) => setImageModel(e.target.value)}
                            className="mt-1"
                          />
                          <div>
                            <h4 className="font-bold text-gray-900">Google Gemini (Imagen)</h4>
                            <p className="text-sm text-gray-600 mt-1">
                              Model: imagen-3.0-generate-002
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              Fast generation with artistic style variations
                            </p>
                            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                              <strong className="text-yellow-800">⚠️ Note:</strong> Gemini may require additional setup. System will auto-fallback to OpenAI if unavailable.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={handleSaveImageModel}
                      disabled={savingImageModel}
                      className="mt-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold"
                    >
                      {savingImageModel ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Image Model
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Image Prompt */}
                  <div>
                    <Label className="text-gray-800 font-bold mb-2 text-lg">
                      Image Generation Prompt
                    </Label>
                    {imagePromptMetadata && imagePromptMetadata.updated_at && (
                      <div className="mb-3 p-3 bg-purple-50 rounded border border-purple-200 text-xs">
                        <p className="text-gray-700 font-semibold">
                          <strong>Last Updated:</strong> {new Date(imagePromptMetadata.updated_at).toLocaleString()} by {imagePromptMetadata.updated_by}
                        </p>
                      </div>
                    )}
                    <p className="text-sm text-gray-600 mb-4 font-medium">
                      Customize the prompt used for AI image generation. This affects the style and content of generated illustrations.
                    </p>
                    <Textarea
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      rows={15}
                      className="font-mono text-sm border-2 border-gray-300 focus:border-[#00A9CE]"
                      placeholder="Enter image generation prompt guidelines..."
                    />
                    <p className="text-xs text-gray-500 mt-2 font-medium">
                      💡 Tip: Include style guidelines, color preferences, layout instructions, and elements to include/avoid.
                    </p>

                    <Button
                      onClick={handleSaveImagePrompt}
                      disabled={savingImagePrompt || !imagePrompt.trim()}
                      className="mt-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold"
                    >
                      {savingImagePrompt ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Image Prompt
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="flex gap-4">
                    <Button
                      onClick={handleSaveBehavior}
                      disabled={savingBehavior || !behaviorPrompt.trim()}
                      className="flex-1 h-14 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl text-lg"
                    >
                      {savingBehavior ? (
                        <>
                          <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5 mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={() => navigate('/market-research/customer-behavior')}
                      variant="outline"
                      className="border-2 border-[#00A9CE] text-[#00A9CE] hover:bg-[#00A9CE] hover:text-white font-bold"
                    >
                      Test in Behavior Tool
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Perception Analysis Prompt Tab */}
              <TabsContent value="perception">
                <div className="space-y-6">
                  {/* Perception Analysis Prompt */}
                  <div>
                    <Label htmlFor="perception-prompt" className="text-lg font-bold text-gray-900 mb-3 block">
                      Customer Perception Analysis Prompt
                    </Label>
                    <p className="text-sm text-gray-600 mb-4 font-medium">
                      Configure the AI prompt for analyzing customer perceptions and attitudes. Leave empty to use default prompt.
                    </p>
                    <Textarea
                      id="perception-prompt"
                      value={perceptionPrompt}
                      onChange={(e) => setPerceptionPrompt(e.target.value)}
                      className="min-h-[200px] font-mono text-sm border-2 border-gray-300 focus:border-[#00A9CE]"
                      placeholder="Enter custom perception analysis prompt or leave empty for default..."
                    />
                    <p className="text-xs text-gray-500 mt-2 font-medium">
                      💡 The prompt should guide the AI to analyze perceptions, attitudes, and provide key findings & recommendations
                    </p>
                  </div>

                  {/* Perception Question Generator Prompt */}
                  <div>
                    <Label htmlFor="perception-question-prompt" className="text-lg font-bold text-gray-900 mb-3 block">
                      Interview Question Generator Prompt
                    </Label>
                    <p className="text-sm text-gray-600 mb-4 font-medium">
                      Configure the AI prompt for generating interview questions. Leave empty to use default prompt.
                    </p>
                    <Textarea
                      id="perception-question-prompt"
                      value={perceptionQuestionPrompt}
                      onChange={(e) => setPerceptionQuestionPrompt(e.target.value)}
                      className="min-h-[200px] font-mono text-sm border-2 border-gray-300 focus:border-[#00A9CE]"
                      placeholder="Enter custom question generation prompt or leave empty for default..."
                    />
                    <p className="text-xs text-gray-500 mt-2 font-medium">
                      💡 The prompt should guide the AI to generate relevant, open-ended interview questions
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="flex gap-4">
                    <Button
                      onClick={handleSavePerceptionPrompt}
                      disabled={savingPerception}
                      className="flex-1 h-14 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl text-lg"
                    >
                      {savingPerception ? (
                        <>
                          <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                          Saving Analysis Prompt...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5 mr-2" />
                          Save Analysis Prompt
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={handleSavePerceptionQuestionPrompt}
                      disabled={savingPerceptionQuestion}
                      className="flex-1 h-14 bg-gradient-to-r from-[#007B9A] via-[#00A9CE] to-[#33BCDA] hover:from-[#006685] hover:to-[#00A9CE] text-white font-bold shadow-xl text-lg"
                    >
                      {savingPerceptionQuestion ? (
                        <>
                          <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                          Saving Question Prompt...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5 mr-2" />
                          Save Question Prompt
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={() => navigate('/market-research/customer-perception')}
                      variant="outline"
                      className="border-2 border-[#00A9CE] text-[#00A9CE] hover:bg-[#00A9CE] hover:text-white font-bold"
                    >
                      Test in Perception Tool
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </Card>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <Card className="p-6 bg-gradient-to-br from-[#00A9CE]/10 to-[#33BCDA]/10 border-2 border-[#00A9CE]/30">
              <h3 className="text-lg font-black text-gray-900 mb-3 flex items-center gap-2">
                <Map className="w-5 h-5" />
                Journey Map Guidelines
              </h3>
              <ul className="space-y-2 text-sm text-gray-700 font-medium">
                <li>• Define AI's role (e.g., "expert customer experience analyst")</li>
                <li>• Specify analysis elements: stages, touchpoints, pain points, emotions</li>
                <li>• Include output format: ANALYSIS + MERMAID sections</li>
                <li>• Provide Mermaid syntax examples with styling</li>
                <li>• Use consistent formatting tags</li>
              </ul>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
              <h3 className="text-lg font-black text-gray-900 mb-3 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Behavior Analysis Guidelines
              </h3>
              <ul className="space-y-2 text-sm text-gray-700 font-medium">
                <li>• Define AI's role (e.g., "consumer behavior analyst")</li>
                <li>• Specify analysis elements: behavioral patterns, motivations, barriers</li>
                <li>• Include output format: ANALYSIS + KEY_FINDINGS + RECOMMENDATIONS</li>
                <li>• Focus on actionable insights</li>
                <li>• Identify psychological and social factors</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
