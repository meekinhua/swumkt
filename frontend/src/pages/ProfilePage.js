import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, User } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    bio: user?.bio || '',
    avatar_url: user?.avatar_url || '',
    student_id: user?.student_id || '',
    graduation_year: user?.graduation_year || ''
  });

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

        <Card className="p-8 bg-white/98 shadow-xl border-2 border-gray-300">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-[#005A73] to-[#00A9CE] rounded-full">
              <User className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900">Your Profile</h1>
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
      </div>
    </div>
  );
};

export default ProfilePage;
