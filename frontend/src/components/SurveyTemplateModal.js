import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Search, FileText, Users, TrendingUp, Target, Eye } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'https://content-preview-9.preview.emergentagent.com';

const SurveyTemplateModal = ({ onClose }) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [selectedType, setSelectedType] = useState('all');

  const surveyTypes = [
    { value: 'all', label: 'All Types', icon: FileText },
    { value: 'market_segmentation', label: 'Market Segmentation', icon: Users },
    { value: 'perception', label: 'Perception', icon: Eye },
    { value: 'competitor', label: 'Competitor', icon: Target },
    { value: 'behavior', label: 'Behavior', icon: TrendingUp },
    { value: 'custom', label: 'Custom', icon: FileText }
  ];

  useEffect(() => {
    loadTemplates();
  }, [selectedType]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const params = selectedType !== 'all' ? { survey_type: selectedType } : {};
      console.log('Loading templates with params:', params);
      const response = await axios.get(`${API}/api/survey-templates`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      console.log('Templates loaded:', response.data.length, 'templates');
      setTemplates(response.data);
    } catch (error) {
      console.error('Failed to load templates:', error);
      toast.error('Failed to load survey templates');
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemplate = async (template) => {
    try {
      const response = await axios.post(
        `${API}/api/surveys/from-template/${template.id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('Survey created from template');
      navigate(`/surveys/${response.data.id}/edit`);
      onClose();
    } catch (error) {
      console.error('Failed to create from template:', error);
      toast.error('Failed to create survey from template');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-gray-200">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Survey Templates</h2>
            <p className="text-sm text-gray-600 mt-1">Start with a pre-built template</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-2">
            <X className="w-6 h-6" />
          </Button>
        </div>

        {/* Type Filters */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex gap-2 flex-wrap">
            {surveyTypes.map(type => {
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                    selectedType === type.value
                      ? 'bg-[#00A9CE] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {type.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Template Grid */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 250px)' }}>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00A9CE] mx-auto"></div>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">No templates found</p>
              <p className="text-sm text-gray-500 mt-2">Create your own or try another category</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {templates.map(template => (
                <Card key={template.id} className="p-6 border-2 border-gray-200 hover:shadow-xl transition-all">
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase px-2 py-1 bg-gray-100 rounded">
                        {template.survey_type.replace(/_/g, ' ')}
                      </span>
                      {template.is_public && (
                        <span className="text-xs font-semibold text-blue-600 px-2 py-1 bg-blue-50 rounded">
                          Public
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-black text-gray-900 mb-2">{template.name}</h3>
                    <p className="text-sm text-gray-700 mb-3">{template.description}</p>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <FileText className="w-4 h-4" />
                      <span>{template.sections?.length || 0} sections</span>
                      <span>•</span>
                      <span>
                        {template.sections?.reduce((acc, s) => acc + (s.questions?.length || 0), 0) || 0} questions
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="w-4 h-4" />
                      <span>Used {template.usage_count} times</span>
                    </div>
                  </div>

                  {template.tags && template.tags.length > 0 && (
                    <div className="flex gap-2 flex-wrap mb-4">
                      {template.tags.map((tag, idx) => (
                        <span key={idx} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <Button
                    onClick={() => handleUseTemplate(template)}
                    className="w-full bg-gradient-to-r from-[#005A73] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold"
                  >
                    Use Template
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default SurveyTemplateModal;
