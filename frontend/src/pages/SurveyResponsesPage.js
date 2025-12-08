import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Navigation from '@/components/Navigation';
import { ArrowLeft, Download, Users, BarChart3, PieChart, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'https://research-tools-1.preview.emergentagent.com';

const SurveyResponsesPage = () => {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState(null);
  const [responses, setResponses] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    anonymous: 0,
    regular: 0,
    trust: 0
  });

  useEffect(() => {
    loadSurveyAndResponses();
  }, [surveyId]);

  const loadSurveyAndResponses = async () => {
    try {
      setLoading(true);
      const [surveyRes, responsesRes] = await Promise.all([
        axios.get(`${API}/api/surveys/${surveyId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/api/surveys/${surveyId}/responses`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setSurvey(surveyRes.data);
      setResponses(responsesRes.data);

      // Calculate stats
      const stats = {
        total: responsesRes.data.length,
        anonymous: responsesRes.data.filter(r => !r.respondent_id).length,
        regular: responsesRes.data.filter(r => r.respondent_type === 'regular').length,
        trust: responsesRes.data.filter(r => r.respondent_type === 'trust').length
      };
      setStats(stats);
    } catch (error) {
      console.error('Failed to load responses:', error);
      toast.error('Failed to load survey responses');
      navigate('/surveys');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const response = await axios.get(
        `${API}/api/surveys/${surveyId}/export?format=${format}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: format === 'csv' ? 'blob' : 'json'
        }
      );

      if (format === 'csv') {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `survey_${surveyId}_responses.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('CSV exported successfully');
      } else {
        const dataStr = JSON.stringify(response.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `survey_${surveyId}_responses.json`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('JSON exported successfully');
      }
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export data');
    }
  };

  const getQuestionAnalytics = (questionId) => {
    const question = survey.sections
      .flatMap(s => s.questions)
      .find(q => q.id === questionId);
    
    if (!question) return null;

    const answers = responses
      .map(r => r.answers.find(a => a.question_id === questionId))
      .filter(Boolean);

    if (question.type === 'multiple_choice_single' || question.type === 'rating_scale') {
      // Count responses per option
      const counts = {};
      question.options.forEach(opt => {
        counts[opt.text] = answers.filter(a => a.value === opt.value).length;
      });
      return {
        type: 'bar',
        data: counts,
        total: answers.length
      };
    }

    if (question.type === 'multiple_choice_multiple') {
      // Count responses per option (multiple can be selected)
      const counts = {};
      question.options.forEach(opt => {
        counts[opt.text] = answers.filter(a => a.values?.includes(opt.value)).length;
      });
      return {
        type: 'bar',
        data: counts,
        total: answers.length
      };
    }

    if (question.type === 'open_ended') {
      return {
        type: 'text',
        responses: answers.map(a => a.text).filter(Boolean),
        total: answers.length
      };
    }

    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00A9CE]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Button
              variant="ghost"
              onClick={() => navigate('/surveys')}
              className="mb-4 text-gray-800 hover:text-[#00A9CE]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Surveys
            </Button>
            <h1 className="text-4xl font-black text-gray-900 mb-2">{survey.title}</h1>
            <p className="text-gray-600 font-medium">Survey Responses & Analytics</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => handleExport('csv')}
              variant="outline"
              className="border-2 border-gray-300"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button
              onClick={() => handleExport('json')}
              variant="outline"
              className="border-2 border-gray-300"
            >
              <Download className="w-4 h-4 mr-2" />
              Export JSON
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6 bg-white/98 border-2 border-blue-200">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-100 text-blue-700">
                <Users className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-semibold">Total Responses</p>
                <p className="text-3xl font-black text-blue-700">{stats.total}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white/98 border-2 border-gray-200">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gray-100 text-gray-700">
                <Users className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-semibold">Anonymous</p>
                <p className="text-3xl font-black text-gray-700">{stats.anonymous}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white/98 border-2 border-green-200">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-100 text-green-700">
                <Users className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-semibold">Regular Users</p>
                <p className="text-3xl font-black text-green-700">{stats.regular}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white/98 border-2 border-amber-200">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-100 text-amber-700">
                <Users className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-semibold">Trust Users</p>
                <p className="text-3xl font-black text-amber-700">{stats.trust}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Question Analytics */}
        {survey.sections.map((section, sectionIndex) => (
          <Card key={section.id} className="p-8 bg-white/98 border-2 border-gray-300 mb-6">
            <h2 className="text-2xl font-black text-gray-900 mb-6">
              {sectionIndex + 1}. {section.title}
            </h2>

            <div className="space-y-8">
              {section.questions.map((question, qIndex) => {
                const analytics = getQuestionAnalytics(question.id);
                if (!analytics) return null;

                return (
                  <div key={question.id} className="border-b-2 border-gray-200 pb-8 last:border-0">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      {qIndex + 1}. {question.text}
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {analytics.total} responses
                    </p>

                    {analytics.type === 'bar' && (
                      <div className="space-y-3">
                        {Object.entries(analytics.data).map(([label, count]) => {
                          const percentage = analytics.total > 0 
                            ? ((count / analytics.total) * 100).toFixed(1)
                            : 0;
                          
                          return (
                            <div key={label} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-700">{label}</span>
                                <span className="text-sm font-bold text-gray-900">
                                  {count} ({percentage}%)
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-4">
                                <div
                                  className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] h-4 rounded-full transition-all"
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {analytics.type === 'text' && (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {analytics.responses.length > 0 ? (
                          analytics.responses.map((text, idx) => (
                            <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                              <p className="text-sm text-gray-700">{text}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-500 italic">No responses</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

        {/* Raw Responses */}
        <Card className="p-8 bg-white/98 border-2 border-gray-300">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-gray-900">Individual Responses</h2>
            <span className="text-sm text-gray-600 font-semibold">{responses.length} total</span>
          </div>

          {responses.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">No responses yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {responses.map((response, idx) => (
                <Card key={response.id} className="p-4 border-2 border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-gray-900">Response #{idx + 1}</p>
                      <p className="text-sm text-gray-600">
                        {response.respondent_email || 'Anonymous'} • 
                        <span className="ml-2 capitalize">{response.respondent_type}</span>
                      </p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(response.submitted_at).toLocaleString()}
                    </span>
                  </div>

                  {response.demographics_snapshot && (
                    <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs font-semibold text-gray-600 mb-2">Demographics</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {response.demographics_snapshot.birth_sex && (
                          <span>Sex: {response.demographics_snapshot.birth_sex}</span>
                        )}
                        {response.demographics_snapshot.education && (
                          <span>Education: {response.demographics_snapshot.education}</span>
                        )}
                        {response.demographics_snapshot.occupation && (
                          <span>Occupation: {response.demographics_snapshot.occupation}</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">{response.answers.length} answers submitted</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default SurveyResponsesPage;
