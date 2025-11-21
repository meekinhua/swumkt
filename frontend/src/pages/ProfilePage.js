import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, User, TrendingUp, Award, Edit } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';
import UserTypeBadge from '@/components/UserTypeBadge';
import DemographicsForm from '@/components/DemographicsForm';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, updateProfile, getDemographics, updateDemographics, getUserRating } = useAuth();
  const [loading, setLoading] = useState(false);
  const [demographics, setDemographics] = useState(null);
  const [rating, setRating] = useState(null);
  const [editingDemographics, setEditingDemographics] = useState(false);
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    bio: user?.bio || '',
    avatar_url: user?.avatar_url || '',
    student_id: user?.student_id || '',
    graduation_year: user?.graduation_year || ''
  });

  useEffect(() => {
    loadDemographicsAndRating();
  }, []);

  const loadDemographicsAndRating = async () => {
    try {
      const [demo, rat] = await Promise.all([
        getDemographics(),
        getUserRating()
      ]);
      setDemographics(demo);
      setRating(rat);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const updateData = { ...formData };
      if (updateData.graduation_year) {
        updateData.graduation_year = parseInt(updateData.graduation_year);
      }
      
      await updateProfile(updateData);
      toast.success('Profile updated successfully!');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveDemographics = async (demographicsData) => {
    try {
      await updateDemographics(demographicsData);
      await loadDemographicsAndRating();
      setEditingDemographics(false);
      toast.success('Demographics updated successfully!');
    } catch (error) {
      toast.error('Failed to update demographics');
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation */}
      <Navigation showMarketResearchButton={true} showContentButton={true} showProfileButton={false} />

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/dashboard')} 
          className="mb-6 text-gray-800 hover:text-[#00A9CE]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        {/* User Type & Rating Card */}
        <Card className="p-6 bg-white/98 shadow-xl border-2 border-gray-300 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Profile Picture - Google or Avatar URL */}
              {user?.google_picture || user?.avatar_url ? (
                <img 
                  src={user?.google_picture || user?.avatar_url} 
                  alt={user?.full_name}
                  className="w-16 h-16 rounded-full border-4 border-[#00A9CE] object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div className={`p-4 bg-gradient-to-br from-[#005A73] to-[#00A9CE] rounded-full ${user?.google_picture || user?.avatar_url ? 'hidden' : 'flex'}`}>
                <User className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900">{user?.full_name}</h1>
                <p className="text-gray-600 text-sm">{user?.email}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <UserTypeBadge userType={user?.user_type} size="lg" />
              {user?.auth_method === 'google' && (
                <span className="text-xs text-gray-500 font-medium">Signed in with Google</span>
              )}
            </div>
          </div>

          {/* Rating Stats */}
          {rating && (
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-gray-700">Surveys Completed</span>
                </div>
                <p className="text-2xl font-black text-blue-600">{rating.total_surveys_completed}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <Award className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-gray-700">Quality Score</span>
                </div>
                <p className="text-2xl font-black text-green-600">{rating.quality_score.toFixed(1)}</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-lg border-2 border-amber-200">
                <div className="flex items-center gap-2 mb-1">
                  <Award className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-gray-700">Trust Score</span>
                </div>
                <p className="text-2xl font-black text-amber-600">{rating.trust_score.toFixed(1)}</p>
              </div>
            </div>
          )}
        </Card>

        {/* ZBS04 Enrollment Card */}
        <Card className="p-6 bg-gradient-to-r from-[#00A9CE]/10 to-[#33BCDA]/10 border-2 border-[#00A9CE]/30 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${user?.zbs04_enrolled ? 'bg-green-500' : 'bg-gray-400'} transition-colors`}>
                <Award className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">วิชาเลือกเสรี ZBS04</h3>
                <p className="text-sm text-gray-600">
                  {user?.zbs04_enrolled ? 'คุณกำลังเรียนวิชานี้' : 'คลิกเพื่อบันทึกว่าคุณเรียนวิชานี้'}
                </p>
              </div>
            </div>
            <Button
              data-testid="zbs04-toggle-btn"
              onClick={async () => {
                try {
                  const newStatus = !user?.zbs04_enrolled;
                  const updatedUser = await updateProfile({ zbs04_enrolled: newStatus });
                  
                  // Force page to recognize the state change
                  if (updatedUser && updatedUser.zbs04_enrolled !== undefined) {
                    toast.success(newStatus ? 'บันทึกว่าคุณเรียน ZBS04 แล้ว!' : 'ยกเลิกการบันทึก ZBS04');
                  }
                } catch (error) {
                  console.error('ZBS04 update error:', error);
                  toast.error('ไม่สามารถอัปเดตสถานะได้');
                }
              }}
              className={`${
                user?.zbs04_enrolled
                  ? 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600'
                  : 'bg-gradient-to-r from-gray-600 to-gray-500 hover:from-gray-700 hover:to-gray-600'
              } text-white font-bold shadow-xl transition-all`}
            >
              {user?.zbs04_enrolled ? '✓ เรียนอยู่' : 'บันทึก'}
            </Button>
          </div>
        </Card>

        {/* Profile Info Card */}
        <Card className="p-8 bg-white/98 shadow-xl border-2 border-gray-300 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-black text-gray-900">Profile Information</h2>
              <p className="text-gray-600 font-medium">Update your personal information</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="full_name" className="text-gray-800 font-bold">Full Name *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => handleChange('full_name', e.target.value)}
                className="border-2 border-gray-300 focus:border-[#00A9CE]"
                required
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-gray-800 font-bold">Email</Label>
              <Input
                id="email"
                value={user?.email}
                disabled
                className="border-2 border-gray-300 bg-gray-100"
              />
            </div>

            <div>
              <Label htmlFor="student_id" className="text-gray-800 font-bold">Student ID</Label>
              <Input
                id="student_id"
                value={formData.student_id}
                onChange={(e) => handleChange('student_id', e.target.value)}
                className="border-2 border-gray-300 focus:border-[#00A9CE]"
              />
            </div>

            <div>
              <Label htmlFor="graduation_year" className="text-gray-800 font-bold">Graduation Year</Label>
              <Input
                id="graduation_year"
                type="number"
                value={formData.graduation_year}
                onChange={(e) => handleChange('graduation_year', e.target.value)}
                className="border-2 border-gray-300 focus:border-[#00A9CE]"
              />
            </div>

            <div>
              <Label htmlFor="bio" className="text-gray-800 font-bold">Bio</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => handleChange('bio', e.target.value)}
                rows={4}
                className="border-2 border-gray-300 focus:border-[#00A9CE]"
              />
            </div>

            <div>
              <Label htmlFor="avatar_url" className="text-gray-800 font-bold">Avatar URL</Label>
              <Input
                id="avatar_url"
                value={formData.avatar_url}
                onChange={(e) => handleChange('avatar_url', e.target.value)}
                className="border-2 border-gray-300 focus:border-[#00A9CE]"
                placeholder="https://..."
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl"
            >
              {loading ? (
                'Saving...'
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </form>
        </Card>

        {/* Demographics Card */}
        <Card className="p-8 bg-white/98 shadow-xl border-2 border-gray-300">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-black text-gray-900">Demographics Information</h2>
              <p className="text-gray-600 font-medium">This information helps improve survey accuracy</p>
            </div>
            {!editingDemographics && demographics && Object.keys(demographics).some(k => demographics[k]) && (
              <Button
                variant="outline"
                onClick={() => setEditingDemographics(true)}
                className="border-2 border-[#00A9CE] text-[#00A9CE] hover:bg-[#00A9CE] hover:text-white"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
          </div>

          {editingDemographics || !demographics || !Object.keys(demographics).some(k => demographics[k]) ? (
            <DemographicsForm
              initialData={demographics || {}}
              onSave={handleSaveDemographics}
              onCancel={() => setEditingDemographics(false)}
              allowIncomeTypeChoice={true}
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {demographics.birth_sex && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 font-semibold">Birth Sex</p>
                  <p className="text-lg font-black text-gray-900 capitalize">{demographics.birth_sex}</p>
                </div>
              )}
              {demographics.gender_identity && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 font-semibold">Gender Identity</p>
                  <p className="text-lg font-black text-gray-900 capitalize">{demographics.gender_identity.replace('_', ' ')}</p>
                </div>
              )}
              {demographics.date_of_birth && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 font-semibold">Date of Birth</p>
                  <p className="text-lg font-black text-gray-900">{demographics.date_of_birth}</p>
                </div>
              )}
              {demographics.education && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 font-semibold">Education</p>
                  <p className="text-lg font-black text-gray-900 capitalize">{demographics.education.replace('_', ' ')}</p>
                </div>
              )}
              {demographics.occupation && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 font-semibold">Occupation</p>
                  <p className="text-lg font-black text-gray-900 capitalize">{demographics.occupation.replace('_', ' ')}</p>
                </div>
              )}
              {demographics.income_value && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 font-semibold">Income</p>
                  <p className="text-lg font-black text-gray-900">{demographics.income_value}</p>
                </div>
              )}
              {demographics.marital_status && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 font-semibold">Marital Status</p>
                  <p className="text-lg font-black text-gray-900 capitalize">{demographics.marital_status}</p>
                </div>
              )}
              {demographics.province && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 font-semibold">Province</p>
                  <p className="text-lg font-black text-gray-900">{demographics.province}</p>
                </div>
              )}
              {demographics.region && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 font-semibold">Region</p>
                  <p className="text-lg font-black text-gray-900 capitalize">{demographics.region}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ProfilePage;
