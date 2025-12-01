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
import { Input } from '@/components/ui/input';
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
  const [imageModel, setImageModel] = useState('nanobanana');
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
  
  // Conjoint Analysis Prompts
  const [conjointQualitativePrompt, setConjointQualitativePrompt] = useState('');
  const [conjointQualitativeMetadata, setConjointQualitativeMetadata] = useState(null);
  const [savingConjointQualitative, setSavingConjointQualitative] = useState(false);
  
  // Conjoint Image Generation Settings
  const [conjointImageSettings, setConjointImageSettings] = useState({
    level_image_prompt_template: '',
    level_image_prompt_with_ref: '',
    level_image_model: 'gpt-image-1',
    profile_image_prompt_template: '',
    profile_image_prompt_with_ref: '',
    profile_image_model: 'gpt-image-1',
    updated_by: null,
    updated_at: null
  });
  const [savingConjointImage, setSavingConjointImage] = useState(false);
  
  // Format Editor LLM Model
  const [formatEditorModel, setFormatEditorModel] = useState('claude-sonnet-4');
  const [formatEditorModelMetadata, setFormatEditorModelMetadata] = useState(null);
  const [savingFormatEditorModel, setSavingFormatEditorModel] = useState(false);
  
  // AI Rearrange Settings
  const [rearrangeSettings, setRearrangeSettings] = useState({
    model: 'gpt-4o',
    prompt_template: '',
    max_tokens: 4000,
    temperature: 0.7
  });
  const [savingRearrange, setSavingRearrange] = useState(false);
  
  // Image Playground
  const [testPrompt, setTestPrompt] = useState('');
  const [testImage, setTestImage] = useState(null);
  const [testImagePreview, setTestImagePreview] = useState(null);
  const [generatedTestImage, setGeneratedTestImage] = useState(null);
  const [generatingTest, setGeneratingTest] = useState(false);
  
  // Migration
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);
  
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
      // Fetch all LLM Prompts (includes Conjoint Analysis)
      const llmPromptsResponse = await axios.get(`${API}/admin/llm-prompts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const allPrompts = llmPromptsResponse.data.prompts || [];
      
      // Find Conjoint Analysis prompt
      const conjointPrompt = allPrompts.find(p => p.id === 'conjoint-qualitative-analysis');
      if (conjointPrompt) {
        setConjointQualitativePrompt(conjointPrompt.prompt_template);
        setConjointQualitativeMetadata({
          updated_by: conjointPrompt.updated_by,
          updated_at: conjointPrompt.updated_at,
          model_provider: conjointPrompt.model_provider,
          model_name: conjointPrompt.model_name,
          system_message: conjointPrompt.system_message
        });
      }
      
      // Fetch Conjoint Image Settings
      const conjointImageResponse = await axios.get(`${API}/admin/conjoint-image-settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConjointImageSettings(conjointImageResponse.data);
      
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

      // Fetch Image Generation Model
      const imageModelResponse = await axios.get(`${API}/admin/image-model`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImageModel(imageModelResponse.data.image_model || 'nanobanana');
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

      // Fetch Format Editor Model
      try {
        const formatModelResponse = await axios.get(`${API}/admin/format-editor-model`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFormatEditorModel(formatModelResponse.data.model || 'claude-sonnet-4');
        setFormatEditorModelMetadata({
          updated_by: formatModelResponse.data.updated_by,
          updated_at: formatModelResponse.data.updated_at
        });
      } catch (err) {
        console.log('Format editor model not set, using default');
      }

      // Fetch AI Rearrange Settings
      try {
        const rearrangeResponse = await axios.get(`${API}/admin/ai-settings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setRearrangeSettings(rearrangeResponse.data);
      } catch (err) {
        console.log('AI Rearrange settings not set, using default');
      }
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
        `${API}/admin/image-model`,
        {
          image_model: imageModel
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const modelName = imageModel === 'nanobanana' ? 'Nano Banana' : 'OpenAI';
      toast.success(`Image model updated to ${modelName} successfully`);
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

  const handleSaveFormatEditorModel = async () => {
    setSavingFormatEditorModel(true);
    try {
      await axios.post(
        `${API}/admin/format-editor-model`,
        { model: formatEditorModel },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Format Editor LLM model saved successfully');
      fetchAllSettings();
    } catch (error) {
      console.error('Error saving format editor model:', error);
      toast.error('Failed to save format editor model');
    } finally {
      setSavingFormatEditorModel(false);
    }
  };

  const handleSaveRearrangeSettings = async () => {
    if (!rearrangeSettings.prompt_template || rearrangeSettings.prompt_template.trim().length < 50) {
      toast.error('Prompt Template ต้องมีความยาวอย่างน้อย 50 ตัวอักษร');
      return;
    }

    // Check if template has required placeholders
    const requiredPlaceholders = ['{title}', '{content}', '{images}'];
    const missingPlaceholders = requiredPlaceholders.filter(
      placeholder => !rearrangeSettings.prompt_template.includes(placeholder)
    );

    if (missingPlaceholders.length > 0) {
      toast.error(`Prompt Template ต้องมี: ${missingPlaceholders.join(', ')}`);
      return;
    }

    setSavingRearrange(true);
    try {
      await axios.put(
        `${API}/admin/ai-settings`,
        rearrangeSettings,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('✅ บันทึกการตั้งค่า AI Rearrange สำเร็จ!');
      fetchAllSettings();
    } catch (error) {
      console.error('Error saving rearrange settings:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSavingRearrange(false);
    }
  };

  const resetRearrangeToDefault = () => {
    const defaultPrompt = `คุณเป็นนักเขียนมืออาชีพและนักออกแบบเนื้อหา กรุณาจัดเรียงและปรับปรุงบทความต่อไปนี้ให้สวยงาม เป็นระเบียบ และอ่านง่ายขึ้น

**หัวข้อบทความ:** {title}

**เนื้อหาเดิม:**
{content}
{images}

**คำแนะนำสำคัญ:**
1. จัดโครงสร้างเนื้อหาใหม่ให้เป็นหมวดหมู่ชัดเจน
2. เพิ่ม headings (h2, h3) ให้เหมาะสม
3. แบ่ง paragraphs ให้อ่านง่าย
4. เน้นจุดสำคัญด้วย bold/italic (ใช้ <strong> และ <em> tags)
5. เพิ่ม bullet points หรือ numbered lists ถ้าเหมาะสม
6. วิเคราะห์รูปภาพและแทรก [รูปภาพที่ X] ในตำแหน่งที่เหมาะสม
7. เพิ่ม introduction และ conclusion ถ้าจำเป็น

**กรุณาเริ่มจัดเรียงเนื้อหาเลย (output HTML โดยตรง):**`;

    setRearrangeSettings({
      model: 'gpt-4o',
      prompt_template: defaultPrompt,
      max_tokens: 4000,
      temperature: 0.7
    });
    toast.info('รีเซ็ตเป็นค่าเริ่มต้นแล้ว (กรุณากดบันทึก)');
  };

  const handleSaveConjointQualitative = async () => {
    setSavingConjointQualitative(true);
    try {
      await axios.put(
        `${API}/admin/llm-prompts/conjoint-qualitative-analysis`,
        { 
          prompt_template: conjointQualitativePrompt,
          system_message: conjointQualitativeMetadata?.system_message
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Conjoint qualitative analysis prompt saved successfully');
      fetchAllSettings();
    } catch (error) {
      console.error('Error saving conjoint prompt:', error);
      toast.error('Failed to save conjoint prompt');
    } finally {
      setSavingConjointQualitative(false);
    }
  };

  const handleSaveConjointImageSettings = async () => {
    setSavingConjointImage(true);
    try {
      await axios.put(
        `${API}/admin/conjoint-image-settings`,
        {
          level_image_prompt_template: conjointImageSettings.level_image_prompt_template,
          level_image_prompt_with_ref: conjointImageSettings.level_image_prompt_with_ref,
          level_image_model: conjointImageSettings.level_image_model,
          profile_image_prompt_template: conjointImageSettings.profile_image_prompt_template,
          profile_image_prompt_with_ref: conjointImageSettings.profile_image_prompt_with_ref,
          profile_image_model: conjointImageSettings.profile_image_model
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('บันทึกการตั้งค่าสำเร็จ!');
      fetchAllSettings();
    } catch (error) {
      console.error('Error saving image settings:', error);
      toast.error('ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSavingConjointImage(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large (max 5MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setTestImage(event.target.result);
      setTestImagePreview(URL.createObjectURL(file));
    };
    reader.readAsDataURL(file);
  };

  const handleTestImageGeneration = async (mode) => {
    if (!testPrompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    if (mode === 'edit' && !testImage) {
      toast.error('Please upload an image first');
      return;
    }

    try {
      setGeneratingTest(true);
      setGeneratedTestImage(null);

      const response = await axios.post(
        `${API}/admin/test-image-generation`,
        {
          prompt: testPrompt,
          model: imageModel,
          base_image: mode === 'edit' ? testImage : null
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setGeneratedTestImage(response.data.image_url);
      toast.success(`Image generated with ${response.data.model_used}!`);
    } catch (error) {
      console.error('Error generating test image:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate image');
    } finally {
      setGeneratingTest(false);
    }
  };

  const clearTestImage = () => {
    setTestImage(null);
    setTestImagePreview(null);
  };

  const fetchMigrationStatus = async () => {
    try {
      const response = await axios.get(`${API}/admin/migration-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMigrationStatus(response.data);
    } catch (error) {
      console.error('Error fetching migration status:', error);
      toast.error('Failed to fetch migration status');
    }
  };

  // Migration progress tracking
  const [migrationProgress, setMigrationProgress] = useState({ processed: 0, total: 0 });

  const runMigration = async () => {
    if (!window.confirm('ต้องการ Migrate ข้อมูลเก่าหรือไม่? ระบบจะประมวลผลทีละ 20 รายการจนกว่าจะเสร็จ')) {
      return;
    }

    setMigrating(true);
    setMigrationResult(null);
    setMigrationProgress({ processed: 0, total: 0 });
    
    let totalProcessed = 0;
    let totalFailed = 0;
    let totalContent = 0;
    let batchCount = 0;
    const maxBatches = 500; // Safety limit
    
    try {
      while (batchCount < maxBatches) {
        batchCount++;
        
        const response = await axios.post(
          `${API}/admin/migrate-content-previews?batch_size=20`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        const data = response.data;
        totalProcessed += data.migrated;
        totalFailed += data.failed || 0;
        totalContent = data.total;
        
        // Update progress
        setMigrationProgress({ 
          processed: totalContent - data.remaining, 
          total: totalContent 
        });
        
        // Show batch progress
        if (data.remaining > 0) {
          toast.info(`ประมวลผลแล้ว ${data.migrated} รายการ เหลืออีก ${data.remaining} รายการ`, {
            duration: 1500
          });
        }
        
        // Check if all complete
        if (data.all_complete || data.remaining === 0) {
          setMigrationResult({
            message: "Migration completed",
            total: totalContent,
            migrated: totalProcessed,
            failed: totalFailed
          });
          toast.success(`✅ Migration เสร็จสมบูรณ์! ประมวลผล ${totalProcessed} รายการ`);
          break;
        }
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Refresh status
      await fetchMigrationStatus();
      
    } catch (error) {
      console.error('Error running migration:', error);
      toast.error(error.response?.data?.detail || 'Migration failed');
      
      // Show partial result if any
      if (totalProcessed > 0) {
        setMigrationResult({
          message: "Migration partially completed",
          total: totalContent,
          migrated: totalProcessed,
          failed: totalFailed
        });
      }
    } finally {
      setMigrating(false);
      setMigrationProgress({ processed: 0, total: 0 });
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
        <Navigation />
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
            
            {/* Quick Links */}
            <div className="mt-6 flex gap-3 justify-center flex-wrap">
              <Button
                onClick={() => navigate('/admin/notifications')}
                className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] text-white font-bold shadow-xl hover:shadow-2xl"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Manage Push Notifications
              </Button>
              <Button
                onClick={() => navigate('/admin/users')}
                className="bg-gradient-to-r from-purple-600 to-purple-500 text-white font-bold shadow-xl hover:shadow-2xl"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Manage Admin Users
              </Button>
            </div>
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
              <TabsList className="grid w-full grid-cols-8 mb-6">
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
                <TabsTrigger value="conjoint" className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Conjoint Analysis
                </TabsTrigger>
                <TabsTrigger value="rearrange" className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  AI Rearrange
                </TabsTrigger>
                <TabsTrigger value="image" className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Image Generation
                </TabsTrigger>
                <TabsTrigger value="format" className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Format Editor
                </TabsTrigger>
                <TabsTrigger value="migration" className="flex items-center gap-2" onClick={fetchMigrationStatus}>
                  <RefreshCw className="w-4 h-4" />
                  Migration
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

                  {/* Note about Image Settings */}
                  <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                    <p className="text-sm text-gray-700 font-medium">
                      💡 <strong>Image generation settings</strong> (model selection, prompt) have been moved to the <strong>&quot;Image Generation&quot;</strong> tab and apply to all tools.
                    </p>
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

              {/* Conjoint Analysis Tab */}
              <TabsContent value="conjoint">
                {conjointQualitativeMetadata && conjointQualitativeMetadata.updated_at && (
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-gray-700 font-semibold">
                      <strong>Last Updated:</strong> {new Date(conjointQualitativeMetadata.updated_at).toLocaleString()} by {conjointQualitativeMetadata.updated_by || 'System'}
                    </p>
                    <p className="text-sm text-gray-700 font-semibold mt-1">
                      <strong>Model:</strong> {conjointQualitativeMetadata.model_provider}/{conjointQualitativeMetadata.model_name}
                    </p>
                  </div>
                )}
                
                <div className="space-y-6">
                  {/* Qualitative Analysis Prompt */}
                  <div>
                    <Label htmlFor="conjoint-qualitative-prompt" className="text-lg font-bold text-gray-900 mb-3 block">
                      Qualitative Analysis Prompt (Phase 1)
                    </Label>
                    <p className="text-sm text-gray-600 mb-4 font-medium">
                      Prompt สำหรับวิเคราะห์ข้อมูลเชิงคุณภาพ (interview, observation) เพื่อหา Attributes และ Levels
                    </p>
                    <Textarea
                      id="conjoint-qualitative-prompt"
                      value={conjointQualitativePrompt}
                      onChange={(e) => setConjointQualitativePrompt(e.target.value)}
                      className="min-h-[300px] font-mono text-sm border-2 border-gray-300 focus:border-[#00A9CE]"
                      placeholder="Enter qualitative analysis prompt..."
                    />
                    <p className="text-xs text-gray-500 mt-2 font-medium">
                      💡 ใช้ {`{combined_data}`} สำหรับข้อมูล qualitative และ {`{target_language}`} สำหรับภาษา
                    </p>
                  </div>

                  {/* System Message */}
                  <div>
                    <Label htmlFor="conjoint-system-message" className="text-lg font-bold text-gray-900 mb-3 block">
                      System Message
                    </Label>
                    <p className="text-sm text-gray-600 mb-4 font-medium">
                      กำหนด role และบริบทของ LLM
                    </p>
                    <Textarea
                      id="conjoint-system-message"
                      value={conjointQualitativeMetadata?.system_message || ''}
                      onChange={(e) => setConjointQualitativeMetadata({
                        ...conjointQualitativeMetadata,
                        system_message: e.target.value
                      })}
                      className="min-h-[100px] font-mono text-sm border-2 border-gray-300 focus:border-[#00A9CE]"
                      placeholder="You are an expert marketing researcher..."
                    />
                  </div>

                  {/* Level Image Generation Settings */}
                  <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
                    <h3 className="text-lg font-bold text-purple-900 mb-4">Level Image Generation</h3>
                    
                    <div className="space-y-4">
                      {/* Model Selection */}
                      <div>
                        <Label className="text-sm font-bold text-purple-900 mb-2 block">
                          Image Model
                        </Label>
                        <select
                          value={conjointImageSettings.level_image_model}
                          onChange={(e) => setConjointImageSettings({
                            ...conjointImageSettings,
                            level_image_model: e.target.value
                          })}
                          className="w-full p-2 border-2 border-purple-300 rounded-lg focus:border-purple-600 focus:outline-none"
                        >
                          <option value="gpt-image-1">OpenAI gpt-image-1</option>
                          <option value="dall-e-3">OpenAI DALL-E 3</option>
                          <option value="nanobanana">🍌 Nano Banana (Gemini 2.5 Flash)</option>
                        </select>
                      </div>
                      
                      {/* Prompt Template - ไม่มี Reference */}
                      <div>
                        <Label className="text-sm font-bold text-purple-900 mb-2 block">
                          Prompt Template (ไม่มีรูปอ้างอิง)
                        </Label>
                        <Textarea
                          value={conjointImageSettings.level_image_prompt_template}
                          onChange={(e) => setConjointImageSettings({
                            ...conjointImageSettings,
                            level_image_prompt_template: e.target.value
                          })}
                          className="min-h-[100px] font-mono text-sm border-2 border-purple-300 focus:border-purple-600"
                          placeholder="Professional product visualization..."
                        />
                        <p className="text-xs text-purple-700 mt-1">
                          💡 ใช้ {`{attribute_name}`} และ {`{level_value}`}
                        </p>
                      </div>
                      
                      {/* Prompt Template - มี Reference */}
                      <div>
                        <Label className="text-sm font-bold text-purple-900 mb-2 block">
                          Prompt Template (มีรูปอ้างอิง)
                        </Label>
                        <Textarea
                          value={conjointImageSettings.level_image_prompt_with_ref || ''}
                          onChange={(e) => setConjointImageSettings({
                            ...conjointImageSettings,
                            level_image_prompt_with_ref: e.target.value
                          })}
                          className="min-h-[100px] font-mono text-sm border-2 border-purple-300 focus:border-purple-600 bg-purple-50"
                          placeholder="Based on the reference images provided..."
                        />
                        <p className="text-xs text-purple-700 mt-1">
                          🎨 Prompt นี้ใช้เมื่อผู้ใช้เลือกรูปอ้างอิง
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Profile Image Generation Settings */}
                  <div className="p-4 bg-indigo-50 rounded-lg border-2 border-indigo-200">
                    <h3 className="text-lg font-bold text-indigo-900 mb-4">Profile Image Generation</h3>
                    
                    <div className="space-y-4">
                      {/* Model Selection */}
                      <div>
                        <Label className="text-sm font-bold text-indigo-900 mb-2 block">
                          Image Model
                        </Label>
                        <select
                          value={conjointImageSettings.profile_image_model}
                          onChange={(e) => setConjointImageSettings({
                            ...conjointImageSettings,
                            profile_image_model: e.target.value
                          })}
                          className="w-full p-2 border-2 border-indigo-300 rounded-lg focus:border-indigo-600 focus:outline-none"
                        >
                          <option value="gpt-image-1">OpenAI gpt-image-1</option>
                          <option value="dall-e-3">OpenAI DALL-E 3</option>
                          <option value="nanobanana">🍌 Nano Banana (Gemini 2.5 Flash)</option>
                        </select>
                      </div>
                      
                      {/* Prompt Template - ไม่มี Reference */}
                      <div>
                        <Label className="text-sm font-bold text-indigo-900 mb-2 block">
                          Prompt Template (ไม่มีรูปอ้างอิง)
                        </Label>
                        <Textarea
                          value={conjointImageSettings.profile_image_prompt_template}
                          onChange={(e) => setConjointImageSettings({
                            ...conjointImageSettings,
                            profile_image_prompt_template: e.target.value
                          })}
                          className="min-h-[100px] font-mono text-sm border-2 border-indigo-300 focus:border-indigo-600"
                          placeholder="Professional product photo showing..."
                        />
                        <p className="text-xs text-indigo-700 mt-1">
                          💡 ใช้ {`{composition}`} สำหรับ profile composition
                        </p>
                      </div>
                      
                      {/* Prompt Template - มี Reference */}
                      <div>
                        <Label className="text-sm font-bold text-indigo-900 mb-2 block">
                          Prompt Template (มีรูปอ้างอิง)
                        </Label>
                        <Textarea
                          value={conjointImageSettings.profile_image_prompt_with_ref || ''}
                          onChange={(e) => setConjointImageSettings({
                            ...conjointImageSettings,
                            profile_image_prompt_with_ref: e.target.value
                          })}
                          className="min-h-[100px] font-mono text-sm border-2 border-indigo-300 focus:border-indigo-600 bg-indigo-50"
                          placeholder="Using the reference images as style guide..."
                        />
                        <p className="text-xs text-indigo-700 mt-1">
                          🎨 Prompt นี้ใช้เมื่อผู้ใช้เลือกรูปอ้างอิง
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Save Buttons */}
                  <div className="flex gap-4">
                    <Button
                      onClick={handleSaveConjointQualitative}
                      disabled={savingConjointQualitative}
                      className="flex-1 h-14 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white font-bold shadow-xl text-lg"
                    >
                      {savingConjointQualitative ? (
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
                      onClick={handleSaveConjointImageSettings}
                      disabled={savingConjointImage}
                      className="flex-1 h-14 bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold shadow-xl text-lg"
                    >
                      {savingConjointImage ? (
                        <>
                          <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                          Saving Image Settings...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5 mr-2" />
                          Save Image Settings
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={() => navigate('/market-research/conjoint-analysis')}
                      variant="outline"
                      className="border-2 border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white font-bold"
                    >
                      Test in Conjoint Tool
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Image Generation Tab */}
              <TabsContent value="image">
                <div className="space-y-6">
                  {/* Model Selection */}
                  <div>
                    <Label className="text-lg font-bold text-gray-900 mb-3 block">
                      Image Generation Model
                    </Label>
                    <p className="text-sm text-gray-600 mb-4 font-medium">
                      Select the AI model for generating images. This setting applies to all tools (Journey Map, Behavior, Perception).
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {/* Nano Banana Option - DEFAULT */}
                      <div
                        onClick={() => setImageModel('nanobanana')}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          imageModel === 'nanobanana'
                            ? 'border-yellow-500 bg-yellow-50'
                            : 'border-gray-300 hover:border-yellow-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="imageModel"
                            value="nanobanana"
                            checked={imageModel === 'nanobanana'}
                            onChange={(e) => setImageModel(e.target.value)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-gray-900">🍌 Nano Banana</h4>
                              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">แนะนำ</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">
                              Model: Gemini 2.5 Flash Image Preview
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              ✨ รองรับ Text-to-Image และ Image Editing
                            </p>
                            <p className="text-xs text-green-600 mt-1 font-medium">
                              ⚡ รวดเร็ว • 🎨 คุณภาพสูง • 🔧 แก้ไขรูปได้
                            </p>
                          </div>
                        </div>
                      </div>

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
                            <h4 className="font-bold text-gray-900">OpenAI DALL-E</h4>
                            <p className="text-sm text-gray-600 mt-1">
                              Model: gpt-image-1
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              🎨 High-quality photorealistic images
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              ⚠️ Text-to-Image เท่านั้น (ไม่รองรับ Image Editing)
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={handleSaveImageModel}
                      disabled={savingImageModel}
                      className="bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold"
                    >
                      {savingImageModel ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Model Selection
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Image Prompt */}
                  <div>
                    <Label className="text-lg font-bold text-gray-900 mb-3 block">
                      Image Generation Prompt (Optional)
                    </Label>
                    <p className="text-sm text-gray-600 mb-4 font-medium">
                      Customize the prompt template for image generation. Leave empty for default.
                    </p>
                    <Textarea
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      className="min-h-[100px] font-mono text-sm border-2 border-gray-300 focus:border-[#00A9CE]"
                      placeholder="Enter custom image generation prompt template..."
                    />
                    <Button
                      onClick={handleSaveImagePrompt}
                      disabled={savingImagePrompt}
                      className="mt-4 bg-gradient-to-r from-[#007B9A] via-[#00A9CE] to-[#33BCDA] hover:from-[#006685] hover:to-[#00A9CE] text-white font-bold"
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

                  {/* Image Generation Playground */}
                  <div className="border-t-2 border-gray-200 pt-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-yellow-500" />
                      Test Image Generation
                    </h3>
                    <p className="text-sm text-gray-600 mb-6">
                      Try out image generation with the selected model. Current model: <strong>{imageModel === 'nanobanana' ? '🍌 Nano Banana' : imageModel === 'gemini' ? 'Gemini Imagen' : 'OpenAI DALL-E'}</strong>
                    </p>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Left: Text to Image */}
                      <Card className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200">
                        <h4 className="font-bold text-gray-900 mb-4">📝 Text to Image</h4>
                        
                        <div className="space-y-4">
                          <div>
                            <Label className="text-gray-700 font-semibold mb-2">Image Prompt</Label>
                            <Textarea
                              value={testPrompt}
                              onChange={(e) => setTestPrompt(e.target.value)}
                              className="min-h-[100px] border-2 border-gray-300"
                              placeholder="e.g., A minimalist icon of a banana with modern design"
                            />
                          </div>

                          <Button
                            onClick={() => handleTestImageGeneration('generate')}
                            disabled={generatingTest || !testPrompt.trim()}
                            className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold"
                          >
                            {generatingTest ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Generate Image
                              </>
                            )}
                          </Button>
                        </div>
                      </Card>

                      {/* Right: Image + Text to Image */}
                      <Card className="p-6 bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-200">
                        <h4 className="font-bold text-gray-900 mb-4">🖼️ Image + Text to Image</h4>
                        {imageModel !== 'nanobanana' && (
                          <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg text-sm text-yellow-800">
                            ⚠️ Image editing only works with Nano Banana model
                          </div>
                        )}
                        
                        <div className="space-y-4">
                          <div>
                            <Label className="text-gray-700 font-semibold mb-2">Base Image</Label>
                            {!testImagePreview ? (
                              <label className="cursor-pointer">
                                <div className="flex items-center justify-center gap-2 px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-yellow-400 hover:bg-yellow-50 transition-colors">
                                  <Upload className="w-5 h-5 text-gray-500" />
                                  <span className="text-gray-600 font-medium">Upload Image</span>
                                </div>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleImageUpload}
                                  className="hidden"
                                />
                              </label>
                            ) : (
                              <div className="relative">
                                <img
                                  src={testImagePreview}
                                  alt="Base"
                                  className="w-full h-32 object-cover rounded-lg border-2 border-gray-300"
                                />
                                <button
                                  onClick={clearTestImage}
                                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          <div>
                            <Label className="text-gray-700 font-semibold mb-2">Edit Prompt</Label>
                            <Textarea
                              value={testPrompt}
                              onChange={(e) => setTestPrompt(e.target.value)}
                              className="min-h-[80px] border-2 border-gray-300"
                              placeholder="e.g., Make it cartoon style with bright colors"
                            />
                          </div>

                          <Button
                            onClick={() => handleTestImageGeneration('edit')}
                            disabled={generatingTest || !testPrompt.trim() || !testImage || imageModel !== 'nanobanana'}
                            className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold"
                          >
                            {generatingTest ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Edit Image
                              </>
                            )}
                          </Button>
                        </div>
                      </Card>
                    </div>

                    {/* Generated Image Result */}
                    {generatedTestImage && (
                      <Card className="mt-6 p-6 bg-white border-2 border-green-300">
                        <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Generated Image
                        </h4>
                        <div className="rounded-lg overflow-hidden border-2 border-gray-300">
                          <img
                            src={generatedTestImage}
                            alt="Generated"
                            className="w-full h-auto"
                          />
                        </div>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* AI Rearrange Tab */}
              <TabsContent value="rearrange">
                <div className="space-y-6">
                  {/* Model Selection */}
                  <div>
                    <Label className="text-gray-800 font-bold mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-yellow-500" />
                      AI Model
                    </Label>
                    <select
                      value={rearrangeSettings.model}
                      onChange={(e) => setRearrangeSettings({ ...rearrangeSettings, model: e.target.value })}
                      className="w-full mt-1 h-12 border-2 border-gray-300 rounded-lg px-3 focus:border-[#00A9CE] focus:outline-none"
                    >
                      <option value="gpt-4o">GPT-4o (แนะนำ) - เร็ว, สมดุล</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo - คุณภาพสูง</option>
                      <option value="claude-sonnet-4-20250514">Claude Sonnet 4 - เขียนได้ดี</option>
                      <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash - เร็วมาก</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Model ที่ใช้สำหรับ AI Rearrange บทความ
                    </p>
                  </div>

                  {/* Temperature */}
                  <div>
                    <Label className="text-gray-800 font-bold mb-2">
                      Temperature: {rearrangeSettings.temperature}
                    </Label>
                    <Input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={rearrangeSettings.temperature}
                      onChange={(e) => setRearrangeSettings({ ...rearrangeSettings, temperature: parseFloat(e.target.value) })}
                      className="w-full mt-1"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0.0 (แม่นยำ)</span>
                      <span>0.5 (สมดุล)</span>
                      <span>1.0 (สร้างสรรค์)</span>
                    </div>
                  </div>

                  {/* Max Tokens */}
                  <div>
                    <Label className="text-gray-800 font-bold mb-2">
                      Max Tokens
                    </Label>
                    <Input
                      type="number"
                      min="1000"
                      max="16000"
                      step="500"
                      value={rearrangeSettings.max_tokens}
                      onChange={(e) => setRearrangeSettings({ ...rearrangeSettings, max_tokens: parseInt(e.target.value) })}
                      className="w-full mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      จำนวน tokens สูงสุดสำหรับ response (แนะนำ: 4000-8000)
                    </p>
                  </div>

                  {/* Prompt Template */}
                  <div>
                    <Label className="text-gray-800 font-bold mb-2">
                      Prompt Template
                    </Label>
                    <Textarea
                      value={rearrangeSettings.prompt_template}
                      onChange={(e) => setRearrangeSettings({ ...rearrangeSettings, prompt_template: e.target.value })}
                      placeholder="ใส่ prompt template ของคุณที่นี่..."
                      rows={20}
                      className="w-full mt-1 font-mono text-sm"
                    />
                    <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm font-medium text-blue-900 mb-1">📝 ตัวแปรที่ต้องมี:</p>
                      <div className="flex gap-4 text-xs text-blue-700">
                        <code className="bg-white px-2 py-1 rounded">{'{title}'}</code>
                        <code className="bg-white px-2 py-1 rounded">{'{content}'}</code>
                        <code className="bg-white px-2 py-1 rounded">{'{images}'}</code>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-4 pt-4 border-t">
                    <Button
                      onClick={handleSaveRearrangeSettings}
                      disabled={savingRearrange}
                      className="flex-1 bg-[#00A9CE] hover:bg-[#008FB5] text-white font-bold"
                    >
                      {savingRearrange ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          กำลังบันทึก...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Save className="w-4 h-4" />
                          บันทึกการตั้งค่า
                        </span>
                      )}
                    </Button>
                    
                    <Button
                      onClick={resetRearrangeToDefault}
                      variant="outline"
                      className="border-2 border-gray-300 hover:bg-gray-50"
                    >
                      รีเซ็ตเป็นค่าเริ่มต้น
                    </Button>
                  </div>
                </div>

                {/* Info Card */}
                <Card className="mt-6 p-6 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200">
                  <h3 className="font-bold text-purple-900 mb-2">💡 Tips:</h3>
                  <ul className="text-sm text-purple-800 space-y-1">
                    <li>• Prompt ที่ชัดเจนและละเอียด จะให้ผลลัพธ์ที่ดีกว่า</li>
                    <li>• Temperature ต่ำ (0.3-0.5) เหมาะกับเนื้อหาที่ต้องการความแม่นยำ</li>
                    <li>• Temperature สูง (0.7-1.0) เหมาะกับเนื้อหาที่ต้องการความสร้างสรรค์</li>
                    <li>• GPT-4o เหมาะสำหรับการใช้งานทั่วไป (เร็วและสมดุล)</li>
                    <li>• Claude Sonnet เหมาะสำหรับการเขียนที่ต้องการคุณภาพสูง</li>
                  </ul>
                </Card>
              </TabsContent>

              {/* Migration Tab */}
              <TabsContent value="migration" className="space-y-6">
                <Card className="p-6 bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-200">
                  <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-orange-600" />
                    Migration Tool - อัปเดตข้อมูลเก่า
                  </h3>
                  
                  <p className="text-sm text-gray-600 mb-6">
                    ใช้เครื่องมือนี้เพื่อประมวลผล Content เก่าที่ยังไม่มี Preview และ Thumbnail 
                    เพื่อให้หน้า Content และ Dashboard โหลดเร็วขึ้น
                  </p>

                  {/* Status Card */}
                  {migrationStatus && (
                    <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                      <h4 className="font-bold text-gray-900 mb-3">📊 สถานะการ Migration:</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <div className="text-2xl font-bold text-gray-900">{migrationStatus.total_content}</div>
                          <div className="text-xs text-gray-600">Content ทั้งหมด</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">{migrationStatus.already_migrated}</div>
                          <div className="text-xs text-gray-600">ประมวลผลแล้ว</div>
                        </div>
                        <div className="text-center p-3 bg-orange-50 rounded-lg">
                          <div className="text-2xl font-bold text-orange-600">{migrationStatus.needs_migration}</div>
                          <div className="text-xs text-gray-600">รอประมวลผล</div>
                        </div>
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">{migrationStatus.percentage_complete}%</div>
                          <div className="text-xs text-gray-600">เสร็จสมบูรณ์</div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-4">
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div 
                            className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${migrationStatus.percentage_complete}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Migration Result */}
                  {migrationResult && (
                    <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                      <h4 className="font-bold text-green-900 mb-2">✅ ผลการ Migration:</h4>
                      <div className="text-sm text-green-800">
                        <p>• ประมวลผลสำเร็จ: <strong>{migrationResult.migrated}</strong> / {migrationResult.total} รายการ</p>
                        {migrationResult.failed > 0 && (
                          <p className="text-red-600">• ล้มเหลว: <strong>{migrationResult.failed}</strong> รายการ</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-4">
                    <Button
                      onClick={fetchMigrationStatus}
                      variant="outline"
                      className="border-2 border-gray-300 hover:bg-gray-50"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      รีเฟรชสถานะ
                    </Button>
                    
                    <Button
                      onClick={runMigration}
                      disabled={migrating || (migrationStatus && migrationStatus.needs_migration === 0)}
                      className="flex-1 h-12 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold shadow-xl"
                    >
                      {migrating ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          กำลังประมวลผล...
                        </>
                      ) : migrationStatus && migrationStatus.needs_migration === 0 ? (
                        <>
                          <Sparkles className="w-5 h-5 mr-2" />
                          ✅ ประมวลผลครบแล้ว
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 mr-2" />
                          เริ่ม Migration
                        </>
                      )}
                    </Button>
                  </div>
                </Card>

                {/* Info Card */}
                <Card className="p-6 bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200">
                  <h3 className="font-bold text-blue-900 mb-2">💡 ข้อมูลเพิ่มเติม:</h3>
                  <ul className="text-sm text-blue-800 space-y-2">
                    <li>• <strong>Preview Text:</strong> สรุปเนื้อหา 200 ตัวอักษรแรก สำหรับแสดงในหน้า Content</li>
                    <li>• <strong>Thumbnail:</strong> ย่อขนาดภาพ Cover เป็น 300x200px เพื่อลดขนาดข้อมูล</li>
                    <li>• <strong>ประโยชน์:</strong> ลดเวลาโหลดหน้า Content และ Dashboard ลง 90%+</li>
                    <li>• <strong>หมายเหตุ:</strong> Content ใหม่จะถูกประมวลผลอัตโนมัติตอนบันทึก</li>
                  </ul>
                </Card>
              </TabsContent>

              {/* Format Editor Tab */}
              <TabsContent value="format" className="space-y-6">
                <Card className="p-6 bg-gradient-to-br from-purple-50 to-white border-2 border-purple-200">
                  <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    LLM Model สำหรับ Format Editor
                  </h3>
                  
                  <p className="text-sm text-gray-600 mb-4">
                    เลือก LLM model ที่จะใช้ในการแก้ไข format บทความวิจัย (Section-by-Section Processing)
                  </p>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-gray-800 font-bold mb-2">
                        LLM Model *
                      </Label>
                      <select
                        value={formatEditorModel}
                        onChange={(e) => setFormatEditorModel(e.target.value)}
                        className="w-full mt-2 h-12 border-2 border-gray-300 rounded-md px-3 focus:border-purple-500 focus:outline-none"
                      >
                        <option value="claude-sonnet-4">Claude Sonnet 4 (Anthropic) - Recommended</option>
                        <option value="gpt-5">GPT-5 (OpenAI)</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (Google)</option>
                        <option value="gemini-flash">Gemini 2.0 Flash (Google) - Fast</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        💡 Claude Sonnet 4 และ GPT-5 ให้ผลลัพธ์ที่ดีที่สุด | Gemini Flash เร็วกว่าแต่อาจแม่นยำน้อยกว่า
                      </p>
                    </div>

                    {formatEditorModelMetadata && (
                      <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
                        <p>Last updated by: {formatEditorModelMetadata.updated_by || 'System'}</p>
                        <p>Last updated: {formatEditorModelMetadata.updated_at ? new Date(formatEditorModelMetadata.updated_at).toLocaleString('th-TH') : 'N/A'}</p>
                      </div>
                    )}

                    <Button
                      onClick={handleSaveFormatEditorModel}
                      disabled={savingFormatEditorModel}
                      className="w-full h-12 bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-bold"
                    >
                      {savingFormatEditorModel ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          กำลังบันทึก...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5 mr-2" />
                          บันทึก Model Setting
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Model Comparison */}
                  <div className="mt-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                    <h4 className="font-bold text-gray-900 mb-3">เปรียบเทียบ Models:</h4>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div>
                        <strong>Claude Sonnet 4:</strong> ความแม่นยำสูง, เข้าใจ context ดีที่สุด, ช้ากว่า (30-40 วินาที/section)
                      </div>
                      <div>
                        <strong>GPT-5:</strong> สมดุล, เร็วกว่า Claude นิดหน่อย (25-35 วินาที/section)
                      </div>
                      <div>
                        <strong>Gemini 2.5 Pro:</strong> คล้าย GPT-5, ดีกับ technical content (25-35 วินาที/section)
                      </div>
                      <div>
                        <strong>Gemini Flash:</strong> เร็วที่สุด แต่แม่นยำน้อยกว่า (15-20 วินาที/section)
                      </div>
                    </div>
                  </div>
                </Card>
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
                <li>• Define AI&apos;s role (e.g., &quot;expert customer experience analyst&quot;)</li>
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
                <li>• Define AI&apos;s role (e.g., &quot;consumer behavior analyst&quot;)</li>
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
