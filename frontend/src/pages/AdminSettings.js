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
import { ArrowLeft, User, LogOut, Settings, Save, RefreshCw, Shield } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';

const AdminSettings = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, token, logout } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    if (user?.role !== 'admin') {
      toast.error('Admin access required');
      navigate('/dashboard');
      return;
    }
    fetchPromptSettings();
  }, [user]);

  const fetchPromptSettings = async () => {
    try {
      const response = await axios.get(`${API}/admin/journey-map-prompt`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPrompt(response.data.journey_map_prompt);
      setMetadata({
        updated_by: response.data.updated_by,
        updated_at: response.data.updated_at
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(
        `${API}/admin/journey-map-prompt`,
        {
          journey_map_prompt: prompt,
          updated_by: user.email,
          updated_at: new Date().toISOString()
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success('Settings saved successfully');
      fetchPromptSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
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
              <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('nav.dashboard')}
              </Button>
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

          {/* Settings Card */}
          <Card className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="w-8 h-8 text-[#00A9CE]" />
              <h2 className="text-2xl font-black text-gray-900">
                Customer Journey Map - AI Prompt
              </h2>
            </div>

            {metadata && metadata.updated_at && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-700 font-semibold">
                  <strong>Last Updated:</strong> {new Date(metadata.updated_at).toLocaleString()} by {metadata.updated_by}
                </p>
              </div>
            )}

            <div className="space-y-6">
              <div>
                <Label htmlFor="prompt" className="text-gray-800 font-bold mb-2 text-lg">
                  System Prompt for Journey Map Generation
                </Label>
                <p className="text-sm text-gray-600 mb-4 font-medium">
                  This prompt will be used by the AI to analyze qualitative research data and generate customer journey maps. 
                  Include guidelines, output format, and examples.
                </p>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
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
                  onClick={handleSave}
                  disabled={saving || !prompt.trim()}
                  className="flex-1 h-14 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl text-lg"
                >
                  {saving ? (
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
          </Card>

          {/* Info Card */}
          <Card className="mt-8 p-6 bg-gradient-to-br from-[#00A9CE]/10 to-[#33BCDA]/10 border-2 border-[#00A9CE]/30">
            <h3 className="text-lg font-black text-gray-900 mb-3">📝 Prompt Guidelines</h3>
            <ul className="space-y-2 text-gray-700 font-medium">
              <li>• Clearly define the AI's role (e.g., "expert market researcher")</li>
              <li>• Specify what to analyze (stages, touchpoints, pain points, emotions)</li>
              <li>• Include output format instructions (analysis summary + Mermaid code)</li>
              <li>• Provide Mermaid syntax examples with proper styling</li>
              <li>• Use consistent formatting tags (e.g., ANALYSIS: and MERMAID:)</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
