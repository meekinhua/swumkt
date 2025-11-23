import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { X, Search, Plus, Trash2, Tag } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'https://conjoint-analysis-1.preview.emergentagent.com';

const QuestionLibraryModal = ({ onClose, onSelectQuestion }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = [
    { value: 'all', label: 'All' },
    { value: 'demographics', label: 'Demographics' },
    { value: 'satisfaction', label: 'Satisfaction' },
    { value: 'behavior', label: 'Behavior' },
    { value: 'preference', label: 'Preference' },
    { value: 'perception', label: 'Perception' }
  ];

  useEffect(() => {
    loadTemplates();
  }, [selectedCategory]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const params = selectedCategory !== 'all' ? { category: selectedCategory } : {};
      const response = await axios.get(`${API}/api/question-templates`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setTemplates(response.data);
    } catch (error) {
      console.error('Failed to load templates:', error);
      toast.error('Failed to load question templates');
    } finally {
      setLoading(false);
    }
  };

  const handleUseQuestion = async (template) => {
    try {
      // Increment usage count
      await axios.post(`${API}/api/question-templates/${template.id}/use`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Return question to parent
      onSelectQuestion(template.question);
      onClose();
      toast.success('Question added from library');
    } catch (error) {
      console.error('Failed to use template:', error);
    }
  };

  const handleDelete = async (templateId) => {
    if (!window.confirm('Delete this question template?')) return;

    try {
      await axios.delete(`${API}/api/question-templates/${templateId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Template deleted');
      loadTemplates();
    } catch (error) {
      toast.error('Failed to delete template');
    }
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.question.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-gray-200">
          <h2 className="text-2xl font-black text-gray-900">Question Library</h2>
          <Button variant="ghost" onClick={onClose} className="p-2">
            <X className="w-6 h-6" />
          </Button>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search questions or tags..."
                  className="pl-10 border-2 border-gray-300 focus:border-[#00A9CE]"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {categories.map(cat => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                  selectedCategory === cat.value
                    ? 'bg-[#00A9CE] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Question List */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 250px)' }}>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00A9CE] mx-auto"></div>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 font-medium">No questions found</p>
              <p className="text-sm text-gray-500 mt-2">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTemplates.map(template => (
                <Card key={template.id} className="p-4 border-2 border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-gray-500 uppercase px-2 py-1 bg-gray-100 rounded">
                          {template.category}
                        </span>
                        <span className="text-xs text-gray-500">
                          Used {template.usage_count} times
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-900 mb-2">{template.question.text}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <span className="capitalize">{template.question.type.replace(/_/g, ' ')}</span>
                        <span>•</span>
                        <span className="capitalize">{template.question.data_type || 'nominal'}</span>
                      </div>
                      {template.tags.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {template.tags.map((tag, idx) => (
                            <span key={idx} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleUseQuestion(template)}
                        className="bg-[#00A9CE] hover:bg-[#008FB5] text-white"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Use
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(template.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Show options preview */}
                  {template.question.options && template.question.options.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs font-semibold text-gray-600 mb-2">Options:</p>
                      <div className="flex gap-2 flex-wrap">
                        {template.question.options.slice(0, 5).map((opt, idx) => (
                          <span key={idx} className="text-xs px-2 py-1 bg-gray-100 rounded">
                            {opt.text}
                          </span>
                        ))}
                        {template.question.options.length > 5 && (
                          <span className="text-xs text-gray-500">
                            +{template.question.options.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default QuestionLibraryModal;
