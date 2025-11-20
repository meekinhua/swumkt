import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Navigation from '@/components/Navigation';
import DemographicsForm from '@/components/DemographicsForm';
import { ArrowLeft, ArrowRight, Send, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'https://cite-master-2.preview.emergentagent.com';

const SurveyTakingPage = () => {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const { user, token, getDemographics } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [survey, setSurvey] = useState(null);
  const [currentStep, setCurrentStep] = useState(0); // 0 = demographics, 1+ = sections
  const [answers, setAnswers] = useState({});
  const [demographics, setDemographics] = useState(null);
  const [respondentEmail, setRespondentEmail] = useState('');

  useEffect(() => {
    loadSurvey();
    if (user) {
      loadDemographics();
    }
  }, [surveyId]);

  const loadSurvey = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/api/surveys/${surveyId}`);
      setSurvey(response.data);
      
      // Skip demographics step if not collecting
      if (!response.data.demographics_config?.collect) {
        setCurrentStep(1);
      }
    } catch (error) {
      console.error('Failed to load survey:', error);
      toast.error('Survey not found or not available');
      navigate('/surveys');
    } finally {
      setLoading(false);
    }
  };

  const loadDemographics = async () => {
    try {
      const demo = await getDemographics();
      if (demo && Object.keys(demo).length > 0) {
        setDemographics(demo);
      }
    } catch (error) {
      console.error('Failed to load demographics:', error);
    }
  };

  const handleAnswerChange = (questionId, value, isMultiple = false) => {
    if (isMultiple) {
      setAnswers(prev => {
        const current = prev[questionId]?.values || [];
        const newValues = current.includes(value)
          ? current.filter(v => v !== value)
          : [...current, value];
        return { ...prev, [questionId]: { question_id: questionId, values: newValues } };
      });
    } else {
      setAnswers(prev => ({ ...prev, [questionId]: { question_id: questionId, value } }));
    }
  };

  const handleTextAnswer = (questionId, text) => {
    setAnswers(prev => ({ ...prev, [questionId]: { question_id: questionId, text } }));
  };

  const validateCurrentSection = () => {
    if (currentStep === 0) {
      // Demographics validation
      if (survey.demographics_config?.collect && !demographics) {
        toast.error('Please fill in demographics information');
        return false;
      }
      if (survey.respondent_auth_mode === 'email' && !respondentEmail) {
        toast.error('Please enter your email');
        return false;
      }
      return true;
    }

    // Question validation
    const section = survey.sections[currentStep - 1];
    for (const question of section.questions) {
      if (question.required && !answers[question.id]) {
        toast.error(`Please answer: ${question.text}`);
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentSection()) return;
    setCurrentStep(prev => Math.min(prev + 1, survey.sections.length));
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (!validateCurrentSection()) return;

    try {
      setSubmitting(true);
      
      const response_data = {
        respondent_email: respondentEmail || undefined,
        demographics: demographics || undefined,
        answers: Object.values(answers)
      };

      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      await axios.post(`${API}/api/surveys/${surveyId}/respond`, response_data, config);
      
      setSubmitted(true);
      toast.success('Survey submitted successfully!');
    } catch (error) {
      console.error('Failed to submit survey:', error);
      toast.error('Failed to submit survey');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00A9CE]"></div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
        <Card className="p-12 max-w-2xl mx-4 text-center bg-white/98 border-2 border-gray-300">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-3xl font-black text-gray-900 mb-4">Thank You!</h1>
          <p className="text-gray-700 text-lg mb-8">Your response has been submitted successfully.</p>
          <Button
            onClick={() => navigate('/surveys')}
            className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold"
          >
            Back to Surveys
          </Button>
        </Card>
      </div>
    );
  }

  const totalSteps = (survey.demographics_config?.collect ? 1 : 0) + survey.sections.length;
  const progress = ((currentStep + 1) / (totalSteps + 1)) * 100;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation showMarketResearchButton={true} showContentButton={true} showProfileButton={true} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <Button
          variant="ghost"
          onClick={() => navigate('/surveys')}
          className="mb-6 text-gray-800 hover:text-[#00A9CE]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {/* Survey Info */}
        <div className="mb-8">
          <h1 className="text-4xl font-black text-gray-900 mb-2">{survey.title}</h1>
          {survey.description && (
            <p className="text-gray-700 text-lg">{survey.description}</p>
          )}
        </div>

        {/* Progress Bar */}
        {survey.settings?.show_progress_bar && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600">Progress</span>
              <span className="text-sm font-semibold text-gray-600">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Demographics Step */}
        {currentStep === 0 && survey.demographics_config?.collect && (
          <Card className="p-8 bg-white/98 border-2 border-gray-300">
            <h2 className="text-2xl font-black text-gray-900 mb-6">Demographics Information</h2>
            <p className="text-gray-600 mb-6">Please provide some basic information about yourself.</p>

            {survey.respondent_auth_mode === 'email' && !user && (
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
                <Input
                  type="email"
                  value={respondentEmail}
                  onChange={(e) => setRespondentEmail(e.target.value)}
                  className="border-2 border-gray-300 focus:border-[#00A9CE]"
                  placeholder="your@email.com"
                  required
                />
              </div>
            )}

            <DemographicsForm
              initialData={demographics || {}}
              onSave={(data) => {
                setDemographics(data);
                handleNext();
              }}
              onCancel={null}
              allowIncomeTypeChoice={false}
            />
          </Card>
        )}

        {/* Question Sections */}
        {currentStep > 0 && currentStep <= survey.sections.length && (
          <Card className="p-8 bg-white/98 border-2 border-gray-300">
            {(() => {
              const section = survey.sections[currentStep - 1];
              return (
                <>
                  <div className="mb-8">
                    <h2 className="text-2xl font-black text-gray-900 mb-2">{section.title}</h2>
                    {section.description && (
                      <p className="text-gray-600">{section.description}</p>
                    )}
                  </div>

                  <div className="space-y-8">
                    {section.questions.map((question, index) => (
                      <div key={question.id} className="border-b-2 border-gray-200 pb-6 last:border-0">
                        <div className="flex items-start gap-2 mb-4">
                          <span className="text-sm font-semibold text-gray-500 mt-1">{index + 1}.</span>
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-gray-900">
                              {question.text}
                              {question.required && <span className="text-red-500 ml-1">*</span>}
                            </h3>
                            {question.description && (
                              <p className="text-sm text-gray-600 mt-1">{question.description}</p>
                            )}
                          </div>
                        </div>

                        {/* Multiple Choice Single */}
                        {question.type === 'multiple_choice_single' && (
                          <div className="space-y-2 pl-6">
                            {question.options.map(option => (
                              <label key={option.id} className="flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="radio"
                                  name={question.id}
                                  value={option.value}
                                  checked={answers[question.id]?.value === option.value}
                                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                                  className="w-5 h-5"
                                />
                                <span className="text-gray-800 font-medium">{option.text}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {/* Multiple Choice Multiple */}
                        {question.type === 'multiple_choice_multiple' && (
                          <div className="space-y-2 pl-6">
                            {question.options.map(option => (
                              <label key={option.id} className="flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  value={option.value}
                                  checked={answers[question.id]?.values?.includes(option.value)}
                                  onChange={(e) => handleAnswerChange(question.id, e.target.value, true)}
                                  className="w-5 h-5"
                                />
                                <span className="text-gray-800 font-medium">{option.text}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {/* Rating Scale */}
                        {question.type === 'rating_scale' && (
                          <div className="flex gap-2 pl-6">
                            {question.options.map(option => (
                              <button
                                key={option.id}
                                onClick={() => handleAnswerChange(question.id, option.value)}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition-all ${
                                  answers[question.id]?.value === option.value
                                    ? 'bg-[#00A9CE] text-white border-[#00A9CE]'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-[#00A9CE]'
                                }`}
                              >
                                {option.text}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Open Ended */}
                        {question.type === 'open_ended' && (
                          <div className="pl-6">
                            <Textarea
                              value={answers[question.id]?.text || ''}
                              onChange={(e) => handleTextAnswer(question.id, e.target.value)}
                              className="border-2 border-gray-300 focus:border-[#00A9CE]"
                              rows={4}
                              placeholder="Type your answer here..."
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </Card>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="border-2 border-gray-300"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          {currentStep < survey.sections.length ? (
            <Button
              onClick={handleNext}
              className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold"
            >
              {submitting ? 'Submitting...' : 'Submit'}
              <Send className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SurveyTakingPage;
