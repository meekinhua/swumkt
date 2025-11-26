import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Settings, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';

const AdminAISettings = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [settings, setSettings] = useState({
    model: 'gpt-4o',
    prompt_template: '',
    max_tokens: 4000,
    temperature: 0.7
  });

  const models = [
    { value: 'gpt-4o', label: 'GPT-4o (แนะนำ)', description: 'เร็ว, สมดุล' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'คุณภาพสูง' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'เขียนได้ดี' },
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash', description: 'เร็วมาก' }
  ];

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      toast.error('ต้องเป็น Admin เท่านั้น');
      navigate('/dashboard');
      return;
    }
    fetchSettings();
  }, [user, navigate]);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API}/admin/ai-settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('ไม่สามารถโหลดการตั้งค่าได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings.prompt_template || settings.prompt_template.trim().length < 50) {
      toast.error('Prompt Template ต้องมีความยาวอย่างน้อย 50 ตัวอักษร');
      return;
    }

    // Check if template has required placeholders
    const requiredPlaceholders = ['{title}', '{content}', '{images}'];
    const missingPlaceholders = requiredPlaceholders.filter(
      placeholder => !settings.prompt_template.includes(placeholder)
    );

    if (missingPlaceholders.length > 0) {
      toast.error(`Prompt Template ต้องมี: ${missingPlaceholders.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      await axios.put(
        `${API}/admin/ai-settings`,
        settings,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('✅ บันทึกการตั้งค่า AI สำเร็จ!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => {
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

    setSettings({
      model: 'gpt-4o',
      prompt_template: defaultPrompt,
      max_tokens: 4000,
      temperature: 0.7
    });
    toast.info('รีเซ็ตเป็นค่าเริ่มต้นแล้ว (กรุณากดบันทึก)');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
        <Navigation />
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#00A9CE] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">กำลังโหลด...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับ
          </Button>
          
          <div className="flex items-center gap-3 mb-2">
            <Settings className="w-8 h-8 text-[#00A9CE]" />
            <h1 className="text-4xl font-bold text-gray-900">AI Rearrange Settings</h1>
          </div>
          <p className="text-gray-600">ปรับแต่ง Prompt และ Model สำหรับ AI Rearrange (Admin Only)</p>
        </div>

        <Card className="p-8">
          <div className="space-y-6">
            {/* Model Selection */}
            <div>
              <Label className="text-gray-800 font-bold mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-500" />
                AI Model
              </Label>
              <Select
                value={settings.model}
                onValueChange={(value) => setSettings({ ...settings, model: value })}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="เลือก Model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{model.label}</span>
                        <span className="text-xs text-gray-500">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Model ที่ใช้สำหรับ AI Rearrange
              </p>
            </div>

            {/* Temperature */}
            <div>
              <Label className="text-gray-800 font-bold mb-2">
                Temperature: {settings.temperature}
              </Label>
              <Input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.temperature}
                onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
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
                value={settings.max_tokens}
                onChange={(e) => setSettings({ ...settings, max_tokens: parseInt(e.target.value) })}
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
                value={settings.prompt_template}
                onChange={(e) => setSettings({ ...settings, prompt_template: e.target.value })}
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
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-[#00A9CE] hover:bg-[#008FB5] text-white font-bold"
              >
                {saving ? (
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
                onClick={resetToDefault}
                variant="outline"
                className="border-2 border-gray-300 hover:bg-gray-50"
              >
                รีเซ็ตเป็นค่าเริ่มต้น
              </Button>
            </div>
          </div>
        </Card>

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
      </div>
    </div>
  );
};

export default AdminAISettings;
