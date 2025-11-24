import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { X, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'https://preference-insight.preview.emergentagent.com';

const AISurveyGeneratorModal = ({ onClose }) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    survey_type: 'custom',
    num_questions: 10,
    target_language: 'en'
  });

  const handleGenerate = async () => {
    if (!formData.description.trim()) {
      toast.error('Please describe what you want to survey');
      return;
    }

    try {
      setGenerating(true);
      const response = await axios.post(
        `${API}/api/surveys/ai-generate`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('AI survey generated successfully!');
      navigate(`/surveys/${response.data.id}/edit`);
      onClose();
    } catch (error) {
      console.error('Failed to generate survey:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate survey with AI');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl bg-white p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900">AI Survey Generator</h2>
              <p className="text-sm text-gray-600">Describe your survey and let AI create it for you</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-2">
            <X className="w-6 h-6" />
          </Button>
        </div>

        {/* Form */}
        <div className="space-y-6">
          <div>
            <Label className="text-gray-700 font-semibold mb-2 block">
              What do you want to survey? *
            </Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Example: I want to understand customer satisfaction with my coffee shop, including product quality, service speed, ambiance, and pricing..."
              rows={5}
              className="border-2 border-gray-300 focus:border-purple-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Be specific about what you want to learn. The more detail, the better the results.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-700 font-semibold mb-2 block">Survey Type</Label>
              <select
                value={formData.survey_type}
                onChange={(e) => setFormData(prev => ({ ...prev, survey_type: e.target.value }))}
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-purple-500 focus:outline-none"
              >
                <option value="custom">Custom Survey</option>
                <option value="market_segmentation">Market Segmentation</option>
                <option value="perception">Perception Analysis</option>
                <option value="competitor">Competitor Analysis</option>
                <option value="behavior">Behavior Analysis</option>
              </select>
            </div>

            <div>
              <Label className="text-gray-700 font-semibold mb-2 block">Number of Questions</Label>
              <Input
                type="number"
                min="5"
                max="20"
                value={formData.num_questions}
                onChange={(e) => setFormData(prev => ({ ...prev, num_questions: parseInt(e.target.value) || 10 }))}
                className="border-2 border-gray-300 focus:border-purple-500"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-700 font-semibold mb-2 block">Language</Label>
            <select
              value={formData.target_language}
              onChange={(e) => setFormData(prev => ({ ...prev, target_language: e.target.value }))}
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-purple-500 focus:outline-none"
            >
              <option value="en">English</option>
              <option value="th">ไทย (Thai)</option>
            </select>
          </div>

          {/* AI Tips */}
          <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Zap className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-purple-900 mb-1">AI Tips</h4>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li>• Include your industry or product category</li>
                  <li>• Specify what insights you're looking for</li>
                  <li>• Mention any specific topics to cover</li>
                  <li>• AI will create a professional, ready-to-use survey</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-2 border-gray-300"
              disabled={generating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold"
            >
              {generating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate with AI
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AISurveyGeneratorModal;
