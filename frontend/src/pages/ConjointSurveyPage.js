import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API } from '@/App';
import axios from 'axios';
import { toast } from 'sonner';
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Send
} from 'lucide-react';

const ConjointSurveyPage = () => {
  const { studyId } = useParams();
  
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [selections, setSelections] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [respondentEmail, setRespondentEmail] = useState('');

  useEffect(() => {
    loadSurvey();
  }, [studyId]);

  const loadSurvey = async () => {
    try {
      const response = await axios.get(`${API}/conjoint/survey/${studyId}`);
      setSurvey(response.data);
    } catch (error) {
      console.error('Error loading survey:', error);
      toast.error('ไม่สามารถโหลดแบบสอบถามได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (choiceSetId, profileId) => {
    setSelections({
      ...selections,
      [choiceSetId]: profileId
    });
  };

  const handleNext = () => {
    const currentSet = survey.choice_sets[currentSetIndex];
    if (!selections[currentSet.id]) {
      toast.error('กรุณาเลือกคำตอบก่อนดำเนินการต่อ');
      return;
    }
    setCurrentSetIndex(currentSetIndex + 1);
  };

  const handlePrevious = () => {
    setCurrentSetIndex(currentSetIndex - 1);
  };

  const handleSubmit = async () => {
    if (Object.keys(selections).length !== survey.choice_sets.length) {
      toast.error('กรุณาตอบคำถามให้ครบทุกข้อ');
      return;
    }

    setSubmitting(true);
    try {
      const responses = survey.choice_sets.map(set => ({
        choice_set_id: set.id,
        selected_profile_id: selections[set.id]
      }));

      await axios.post(`${API}/conjoint/survey/${studyId}/response`, {
        study_id: studyId,
        respondent_email: respondentEmail || undefined,
        responses: responses
      });

      setSubmitted(true);
      toast.success('ส่งคำตอบสำเร็จ! ขอบคุณที่ร่วมตอบแบบสอบถาม');
    } catch (error) {
      console.error('Error submitting:', error);
      toast.error('ไม่สามารถส่งคำตอบได้');
    } finally {
      setSubmitting(false);
    }
  };

  const getAttributeValue = (profile, attrId) => {
    const levelId = profile.attribute_levels[attrId];
    const attr = survey.attributes.find(a => a.id === attrId);
    const level = attr?.levels.find(l => l.id === levelId);
    return level;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="p-8 max-w-md text-center">
          <p className="text-gray-700 font-semibold">ไม่พบแบบสอบถาม</p>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <Card className="p-8 max-w-md text-center bg-white border-2 border-green-300">
          <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-6" />
          <h1 className="text-3xl font-black text-gray-900 mb-4">
            ขอบคุณสำหรับการตอบแบบสอบถาม!
          </h1>
          <p className="text-gray-700">
            คำตอบของคุณจะถูกนำไปวิเคราะห์เพื่อประโยชน์ในการวิจัย
          </p>
        </Card>
      </div>
    );
  }

  const currentSet = survey.choice_sets[currentSetIndex];
  const progress = ((currentSetIndex + 1) / survey.choice_sets.length) * 100;
  const isLastSet = currentSetIndex === survey.choice_sets.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <Card className="p-6 mb-6 bg-white border-2 border-blue-300">
          <h1 className="text-3xl font-black text-gray-900 mb-2">
            {survey.title}
          </h1>
          {survey.description && (
            <p className="text-gray-700 mb-4">{survey.description}</p>
          )}
          
          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-700">
                ข้อ {currentSetIndex + 1} จาก {survey.choice_sets.length}
              </span>
              <span className="text-sm font-bold text-blue-600">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </Card>

        {/* Question */}
        <Card className="p-6 mb-6 bg-white border-2 border-gray-300">
          <h2 className="text-xl font-black text-gray-900 mb-6">
            หากคุณมีทางเลือกต่อไปนี้ คุณจะเลือกแบบไหน?
          </h2>

          <div className={`grid gap-4 ${
            currentSet.profiles.length === 4
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              : currentSet.profiles.length === 3
              ? 'grid-cols-1 md:grid-cols-3'
              : currentSet.profiles.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1'
          }`}>
            {currentSet.profiles.map((profile, idx) => {
              const isSelected = selections[currentSet.id] === profile.id;
              const hasProfileImage = profile.profile_image_url;
              
              return (
                <button
                  key={profile.id}
                  onClick={() => handleSelect(currentSet.id, profile.id)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 shadow-lg'
                      : 'border-gray-300 hover:border-blue-400 bg-white'
                  }`}
                >
                  <div className="font-bold text-gray-900 mb-4 text-center">
                    ตัวเลือก {String.fromCharCode(65 + idx)}
                  </div>
                  
                  {/* Show Profile Image if available */}
                  {hasProfileImage ? (
                    <div className="mb-4">
                      <img
                        src={profile.profile_image_url}
                        alt={`Profile ${String.fromCharCode(65 + idx)}`}
                        className="w-full h-48 object-cover rounded border-2 border-gray-200"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : null}
                  
                  {/* Attribute details */}
                  <div className="space-y-3">
                    {survey.attributes.map((attr) => {
                      const level = getAttributeValue(profile, attr.id);
                      
                      return (
                        <div key={attr.id}>
                          <div className="text-xs font-bold text-gray-600 mb-1">
                            {attr.name}
                          </div>
                          
                          {/* Show individual level image only if no profile image */}
                          {!hasProfileImage && level?.image_url && (
                            <img
                              src={level.image_url}
                              alt={level.value}
                              className="w-full h-32 object-cover rounded mb-2"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          )}
                          
                          <div className="text-sm font-bold text-gray-900">
                            {level?.value}
                          </div>
                          
                          {level?.description && (
                            <div className="text-xs text-gray-600 mt-1">
                              {level.description}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {isSelected && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-blue-600 font-bold">
                      <CheckCircle className="w-5 h-5" />
                      เลือกตัวเลือกนี้
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            onClick={handlePrevious}
            disabled={currentSetIndex === 0}
            variant="outline"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            ย้อนกลับ
          </Button>

          {isLastSet ? (
            <div className="flex-1 max-w-md mx-4">
              <input
                type="email"
                value={respondentEmail}
                onChange={(e) => setRespondentEmail(e.target.value)}
                placeholder="อีเมล (ถ้าต้องการ)"
                className="w-full p-2 border-2 border-gray-300 rounded-lg mb-2 text-sm"
              />
              <Button
                onClick={handleSubmit}
                disabled={submitting || !selections[currentSet.id]}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    กำลังส่ง...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    ส่งคำตอบ
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!selections[currentSet.id]}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold"
            >
              ถัดไป
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConjointSurveyPage;
