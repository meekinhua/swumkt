import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Navigation from '@/components/Navigation';
import { ArrowLeft, Save, Plus, Trash2, GripVertical, Settings, Library, BookMarked } from 'lucide-react';
import { toast } from 'sonner';
import QuestionLibraryModal from '@/components/QuestionLibraryModal';

const API = process.env.REACT_APP_BACKEND_URL || 'https://conjoint-analyzer.preview.emergentagent.com';

const SurveyBuilderPage = () => {
  const navigate = useNavigate();
  const { surveyId } = useParams();
  const { token } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showQuestionLibrary, setShowQuestionLibrary] = useState(false);
  const [currentSectionForLibrary, setCurrentSectionForLibrary] = useState(null);

  const [surveyData, setSurveyData] = useState({
    title: '',
    description: '',
    survey_type: 'custom',
    respondent_auth_mode: 'anonymous',
    demographics_config: {
      collect: true,
      auto_fill: true,
      fields: ['birth_sex', 'gender_identity', 'date_of_birth', 'education', 'occupation']
    },
    sections: [],
    settings: {
      allow_multiple_submissions: false,
      show_progress_bar: true,
      randomize_questions: false,
      randomize_options: false,
      allow_anonymous: true
    }
  });

  useEffect(() => {
    if (surveyId) {
      loadSurvey();
    }
  }, [surveyId]);

  const loadSurvey = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/api/surveys/${surveyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSurveyData(response.data);
    } catch (error) {
      console.error('Failed to load survey:', error);
      toast.error('Failed to load survey');
      navigate('/surveys');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!surveyData.title.trim()) {
      toast.error('Please enter a survey title');
      return;
    }

    try {
      setSaving(true);
      if (surveyId) {
        // Update existing survey
        await axios.put(`${API}/api/surveys/${surveyId}`, surveyData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Survey updated successfully');
      } else {
        // Create new survey
        const response = await axios.post(`${API}/api/surveys`, {
          title: surveyData.title,
          description: surveyData.description,
          survey_type: surveyData.survey_type,
          respondent_auth_mode: surveyData.respondent_auth_mode
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        toast.success('Survey created successfully');
        navigate(`/surveys/${response.data.id}/edit`);
      }
    } catch (error) {
      console.error('Failed to save survey:', error);
      toast.error('Failed to save survey');
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    const newSection = {
      id: `section_${Date.now()}`,
      title: 'New Section',
      description: '',
      questions: [],
      order: surveyData.sections.length
    };
    setSurveyData(prev => ({
      ...prev,
      sections: [...prev.sections, newSection]
    }));
  };

  const updateSection = (sectionId, field, value) => {
    setSurveyData(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId ? { ...section, [field]: value } : section
      )
    }));
  };

  const deleteSection = (sectionId) => {
    setSurveyData(prev => ({
      ...prev,
      sections: prev.sections.filter(section => section.id !== sectionId)
    }));
  };

  const addQuestion = (sectionId) => {
    const newQuestion = {
      id: `q_${Date.now()}`,
      type: 'multiple_choice_single',
      text: 'New Question',
      description: '',
      required: true,
      data_type: 'nominal',
      options: [
        { id: `opt_${Date.now()}_1`, text: 'Option 1', value: '1' },
        { id: `opt_${Date.now()}_2`, text: 'Option 2', value: '2' }
      ],
      order: 0
    };

    setSurveyData(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId
          ? { ...section, questions: [...section.questions, newQuestion] }
          : section
      )
    }));
  };

  const openQuestionLibrary = (sectionId) => {
    setCurrentSectionForLibrary(sectionId);
    setShowQuestionLibrary(true);
  };

  const handleAddQuestionFromLibrary = (question) => {
    if (!currentSectionForLibrary) return;
    
    // Give new IDs to avoid conflicts
    const newQuestion = {
      ...question,
      id: `q_${Date.now()}`,
      options: question.options?.map((opt, idx) => ({
        ...opt,
        id: `opt_${Date.now()}_${idx}`
      })) || []
    };

    setSurveyData(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === currentSectionForLibrary
          ? { ...section, questions: [...section.questions, newQuestion] }
          : section
      )
    }));
  };

  const handleSaveAsTemplate = async () => {
    if (!surveyId) {
      toast.error('Please save the survey first');
      return;
    }

    const templateName = window.prompt('Enter template name:', surveyData.title + ' Template');
    if (!templateName) return;

    try {
      await axios.post(`${API}/api/survey-templates`, {
        name: templateName,
        description: surveyData.description,
        survey_type: surveyData.survey_type,
        sections: surveyData.sections,
        is_public: false,
        tags: []
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Survey saved as template!');
    } catch (error) {
      console.error('Failed to save template:', error);
      toast.error('Failed to save as template');
    }
  };

  const handleSaveQuestionAsTemplate = async (sectionId, questionId) => {
    const question = surveyData.sections
      .find(s => s.id === sectionId)?.questions
      .find(q => q.id === questionId);
    
    if (!question) return;

    const category = window.prompt('Enter category:', 'custom');
    if (!category) return;

    try {
      await axios.post(`${API}/api/question-templates`, {
        category,
        question,
        tags: [],
        is_public: false
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Question saved to library!');
    } catch (error) {
      console.error('Failed to save question:', error);
      toast.error('Failed to save question');
    }
  };

  const updateQuestion = (sectionId, questionId, field, value) => {
    setSurveyData(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId
          ? {
              ...section,
              questions: section.questions.map(q =>
                q.id === questionId ? { ...q, [field]: value } : q
              )
            }
          : section
      )
    }));
  };

  const deleteQuestion = (sectionId, questionId) => {
    setSurveyData(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId
          ? { ...section, questions: section.questions.filter(q => q.id !== questionId) }
          : section
      )
    }));
  };

  const addOption = (sectionId, questionId) => {
    setSurveyData(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId
          ? {
              ...section,
              questions: section.questions.map(q =>
                q.id === questionId
                  ? {
                      ...q,
                      options: [
                        ...q.options,
                        { id: `opt_${Date.now()}`, text: `Option ${q.options.length + 1}`, value: `${q.options.length + 1}` }
                      ]
                    }
                  : q
              )
            }
          : section
      )
    }));
  };

  const updateOption = (sectionId, questionId, optionId, field, value) => {
    setSurveyData(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId
          ? {
              ...section,
              questions: section.questions.map(q =>
                q.id === questionId
                  ? {
                      ...q,
                      options: q.options.map(opt =>
                        opt.id === optionId ? { ...opt, [field]: value } : opt
                      )
                    }
                  : q
              )
            }
          : section
      )
    }));
  };

  const deleteOption = (sectionId, questionId, optionId) => {
    setSurveyData(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId
          ? {
              ...section,
              questions: section.questions.map(q =>
                q.id === questionId
                  ? { ...q, options: q.options.filter(opt => opt.id !== optionId) }
                  : q
              )
            }
          : section
      )
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00A9CE]"></div>
      </div>
    );
  }

  return (
    <>
      {showQuestionLibrary && (
        <QuestionLibraryModal
          onClose={() => setShowQuestionLibrary(false)}
          onSelectQuestion={handleAddQuestionFromLibrary}
        />
      )}
      
      <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
        <Navigation />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/surveys')}
            className="text-gray-800 hover:text-[#00A9CE] mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Surveys
          </Button>
          <div className="flex flex-wrap gap-2">
            {surveyId && (
              <Button
                variant="outline"
                onClick={handleSaveAsTemplate}
                className="border-2 border-gray-300 text-sm sm:text-base flex-1 sm:flex-none"
              >
                <BookMarked className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Save as Template</span>
                <span className="sm:hidden">Template</span>
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold text-sm sm:text-base flex-1 sm:flex-none"
            >
              <Save className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save Survey'}</span>
              <span className="sm:hidden">{saving ? 'Saving...' : 'Save'}</span>
            </Button>
          </div>
        </div>

        {/* Basic Info */}
        <Card className="p-8 bg-white/98 border-2 border-gray-300 mb-6">
          <h2 className="text-2xl font-black text-gray-900 mb-6">Survey Information</h2>
          
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold">Title *</Label>
              <Input
                value={surveyData.title}
                onChange={(e) => setSurveyData(prev => ({ ...prev, title: e.target.value }))}
                className="mt-2 border-2 border-gray-300 focus:border-[#00A9CE]"
                placeholder="Enter survey title"
              />
            </div>

            <div>
              <Label className="text-gray-700 font-semibold">Description</Label>
              <Textarea
                value={surveyData.description}
                onChange={(e) => setSurveyData(prev => ({ ...prev, description: e.target.value }))}
                className="mt-2 border-2 border-gray-300 focus:border-[#00A9CE]"
                placeholder="Describe your survey"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-700 font-semibold">Survey Type</Label>
                <select
                  value={surveyData.survey_type}
                  onChange={(e) => setSurveyData(prev => ({ ...prev, survey_type: e.target.value }))}
                  className="mt-2 w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
                >
                  <option value="custom">Custom Survey</option>
                  <option value="market_segmentation">Market Segmentation</option>
                  <option value="perception">Perception Analysis</option>
                  <option value="competitor">Competitor Analysis</option>
                  <option value="behavior">Behavior Analysis</option>
                  <option value="conjoint">Conjoint Analysis</option>
                </select>
              </div>

              <div>
                <Label className="text-gray-700 font-semibold">Respondent Mode</Label>
                <select
                  value={surveyData.respondent_auth_mode}
                  onChange={(e) => setSurveyData(prev => ({ ...prev, respondent_auth_mode: e.target.value }))}
                  className="mt-2 w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
                >
                  <option value="anonymous">Anonymous</option>
                  <option value="email">Email Required</option>
                  <option value="login">Login Required</option>
                </select>
              </div>
            </div>
          </div>
        </Card>

        {/* Sections */}
        <div className="space-y-6 mb-6">
          {surveyData.sections.map((section, sectionIndex) => (
            <Card key={section.id} className="p-6 bg-white/98 border-2 border-gray-300">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-5 h-5 text-gray-400" />
                  <h3 className="text-xl font-black text-gray-900">Section {sectionIndex + 1}</h3>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteSection(section.id)}
                  className="text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4 mb-4">
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(section.id, 'title', e.target.value)}
                  className="border-2 border-gray-300 focus:border-[#00A9CE] font-semibold"
                  placeholder="Section title"
                />

                <Textarea
                  value={section.description || ''}
                  onChange={(e) => updateSection(section.id, 'description', e.target.value)}
                  className="border-2 border-gray-300 focus:border-[#00A9CE]"
                  placeholder="Section description (optional)"
                  rows={2}
                />
              </div>

              {/* Questions */}
              <div className="space-y-4">
                {section.questions.map((question, qIndex) => (
                  <div key={question.id} className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-600">Question {qIndex + 1}</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveQuestionAsTemplate(section.id, question.id)}
                          className="text-blue-600 hover:bg-blue-50 h-6 px-2"
                          title="Save to library"
                        >
                          <BookMarked className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteQuestion(section.id, question.id)}
                          className="text-red-600 hover:bg-red-50 h-6 w-6 p-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Input
                        value={question.text}
                        onChange={(e) => updateQuestion(section.id, question.id, 'text', e.target.value)}
                        className="border-2 border-gray-300 focus:border-[#00A9CE] font-medium"
                        placeholder="Question text"
                      />

                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={question.type}
                          onChange={(e) => updateQuestion(section.id, question.id, 'type', e.target.value)}
                          className="border-2 border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-[#00A9CE] focus:outline-none"
                        >
                          <option value="multiple_choice_single">Multiple Choice (Single)</option>
                          <option value="multiple_choice_multiple">Multiple Choice (Multiple)</option>
                          <option value="rating_scale">Rating Scale</option>
                          <option value="open_ended">Open Ended</option>
                        </select>

                        <select
                          value={question.data_type || 'nominal'}
                          onChange={(e) => updateQuestion(section.id, question.id, 'data_type', e.target.value)}
                          className="border-2 border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-[#00A9CE] focus:outline-none"
                        >
                          <option value="nominal">Nominal</option>
                          <option value="ordinal">Ordinal</option>
                          <option value="scale">Scale</option>
                        </select>

                        <label className="flex items-center gap-2 border-2 border-gray-300 rounded-lg px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={question.required}
                            onChange={(e) => updateQuestion(section.id, question.id, 'required', e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm font-medium">Required</span>
                        </label>
                      </div>

                      {/* Options */}
                      {(question.type.includes('multiple_choice') || question.type === 'rating_scale') && (
                        <div className="space-y-2">
                          {question.options.map((option, optIndex) => (
                            <div key={option.id} className="flex gap-2">
                              <Input
                                value={option.text}
                                onChange={(e) => updateOption(section.id, question.id, option.id, 'text', e.target.value)}
                                className="flex-1 border-2 border-gray-300 focus:border-[#00A9CE] text-sm"
                                placeholder={`Option ${optIndex + 1}`}
                              />
                              <Input
                                value={option.value}
                                onChange={(e) => updateOption(section.id, question.id, option.id, 'value', e.target.value)}
                                className="w-20 border-2 border-gray-300 focus:border-[#00A9CE] text-sm"
                                placeholder="Value"
                              />
                              {question.options.length > 2 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteOption(section.id, question.id, option.id)}
                                  className="text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addOption(section.id, question.id)}
                            className="w-full"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add Option
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => addQuestion(section.id)}
                    className="flex-1 border-2 border-dashed border-gray-300 hover:border-[#00A9CE] hover:bg-[#00A9CE]/5"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add New Question
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openQuestionLibrary(section.id)}
                    className="border-2 border-blue-300 hover:border-blue-500 hover:bg-blue-50 text-blue-700"
                  >
                    <Library className="w-4 h-4 mr-2" />
                    From Library
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Add Section Button */}
        <Button
          onClick={addSection}
          variant="outline"
          className="w-full border-2 border-dashed border-gray-400 hover:border-[#00A9CE] hover:bg-[#00A9CE]/5 py-6"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Section
        </Button>
        </div>
      </div>
    </>
  );
};

export default SurveyBuilderPage;
