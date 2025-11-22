import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API } from '@/App';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Code,
  Sparkles
} from 'lucide-react';

const AdminLLMPrompts = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [editedPrompt, setEditedPrompt] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (user && token) {
      if (user.user_type !== 'admin') {
        toast.error('Admin access required');
        navigate('/dashboard');
        return;
      }
      loadPrompts();
    }
  }, [user, token]);

  const loadPrompts = async () => {
    try {
      const response = await axios.get(`${API}/admin/llm-prompts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPrompts(response.data.prompts);
      
      if (response.data.prompts.length > 0) {
        const first = response.data.prompts[0];
        setSelectedPrompt(first);
        setEditedPrompt({ ...first });
      }
    } catch (error) {
      console.error('Error loading prompts:', error);
      toast.error('ไม่สามารถโหลด prompts ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPrompt = (prompt) => {
    if (hasChanges) {
      if (!window.confirm('คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก คุณต้องการละทิ้งการเปลี่ยนแปลงหรือไม่?')) {
        return;
      }
    }
    
    setSelectedPrompt(prompt);
    setEditedPrompt({ ...prompt });
    setHasChanges(false);
  };

  const handleChange = (field, value) => {
    setEditedPrompt({ ...editedPrompt, [field]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!editedPrompt) return;

    setSaving(true);
    try {
      await axios.put(
        `${API}/admin/llm-prompts/${editedPrompt.id}`,
        {
          prompt_template: editedPrompt.prompt_template,
          system_message: editedPrompt.system_message,
          model_provider: editedPrompt.model_provider,
          model_name: editedPrompt.model_name
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('บันทึก prompt สำเร็จ');
      setHasChanges(false);
      await loadPrompts();
    } catch (error) {
      console.error('Error saving prompt:', error);
      toast.error('ไม่สามารถบันทึก prompt ได้');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (selectedPrompt) {
      setEditedPrompt({ ...selectedPrompt });
      setHasChanges(false);
    }
  };

  const getCategoryLabel = (category) => {
    const labels = {
      conjoint_qualitative: 'Conjoint Analysis - Qualitative Phase',
      image_generation: 'Image Generation',
      text_analysis: 'Text Analysis'
    };
    return labels[category] || category;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#00A9CE]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับ
          </Button>

          <div className="flex items-center gap-3 mb-2">
            <Code className="w-8 h-8 text-[#00A9CE]" />
            <h1 className="text-4xl font-black text-gray-900">
              LLM Prompt Management
            </h1>
          </div>
          <p className="text-gray-600">
            จัดการ prompts ที่ใช้ในการเรียก LLM สำหรับฟีเจอร์ต่างๆ
          </p>
        </div>

        {/* Alert */}
        <Card className="p-4 mb-6 bg-yellow-50 border-2 border-yellow-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-bold mb-1">คำเตือน: Admin Feature</p>
              <p>การแก้ไข prompts จะส่งผลต่อการทำงานของระบบ กรุณาทดสอบอย่างละเอียดหลังการเปลี่ยนแปลง</p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Prompt List */}
          <div className="lg:col-span-1">
            <Card className="p-4 bg-white border-2 border-gray-300">
              <h2 className="text-lg font-black text-gray-900 mb-4">Prompts</h2>
              
              <div className="space-y-2">
                {prompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    onClick={() => handleSelectPrompt(prompt)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      selectedPrompt?.id === prompt.id
                        ? 'border-[#00A9CE] bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-bold text-sm text-gray-900 mb-1">
                      {prompt.name}
                    </div>
                    <div className="text-xs text-gray-600">
                      {getCategoryLabel(prompt.category)}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Editor */}
          <div className="lg:col-span-3">
            {editedPrompt ? (
              <Card className="p-6 bg-white border-2 border-gray-300">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 mb-1">
                      {editedPrompt.name}
                    </h2>
                    <p className="text-sm text-gray-600">
                      {getCategoryLabel(editedPrompt.category)}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {hasChanges && (
                      <span className="text-xs text-orange-600 font-bold px-2 py-1 bg-orange-100 rounded">
                        มีการเปลี่ยนแปลง
                      </span>
                    )}
                    <Button
                      onClick={handleReset}
                      variant="outline"
                      disabled={!hasChanges}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      รีเซ็ต
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={!hasChanges || saving}
                      className="bg-gradient-to-r from-[#007B9A] to-[#00A9CE] text-white"
                    >
                      {saving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                          กำลังบันทึก...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          บันทึก
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Model Configuration */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                  <h3 className="text-sm font-bold text-gray-900 mb-3">Model Configuration</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">
                        Provider
                      </label>
                      <select
                        value={editedPrompt.model_provider}
                        onChange={(e) => handleChange('model_provider', e.target.value)}
                        className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none text-sm"
                      >
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="openai">OpenAI (GPT)</option>
                        <option value="gemini">Google (Gemini)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">
                        Model Name
                      </label>
                      <input
                        type="text"
                        value={editedPrompt.model_name}
                        onChange={(e) => handleChange('model_name', e.target.value)}
                        className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none text-sm font-mono"
                        placeholder="claude-sonnet-4-20250514"
                      />
                    </div>
                  </div>
                </div>

                {/* System Message */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    System Message
                  </label>
                  <textarea
                    value={editedPrompt.system_message || ''}
                    onChange={(e) => handleChange('system_message', e.target.value)}
                    rows={3}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none font-mono text-sm"
                    placeholder="System message for the LLM..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    กำหนด role และบริบทของ LLM
                  </p>
                </div>

                {/* Prompt Template */}
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Prompt Template
                  </label>
                  <textarea
                    value={editedPrompt.prompt_template}
                    onChange={(e) => handleChange('prompt_template', e.target.value)}
                    rows={20}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    💡 ใช้ {`{variable_name}`} สำหรับตัวแปรที่จะถูกแทนที่ขณะรันไทม์
                  </p>
                </div>

                {/* Metadata */}
                {editedPrompt.updated_at && (
                  <div className="mt-6 pt-4 border-t-2 border-gray-200">
                    <div className="text-xs text-gray-600">
                      <p>
                        <span className="font-bold">Last Updated:</span>{' '}
                        {new Date(editedPrompt.updated_at).toLocaleString('th-TH')}
                      </p>
                      {editedPrompt.updated_by && (
                        <p className="mt-1">
                          <span className="font-bold">Updated By:</span> {editedPrompt.updated_by}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="p-12 bg-white border-2 border-gray-300 text-center">
                <Sparkles className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-semibold">เลือก prompt เพื่อแก้ไข</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLLMPrompts;
