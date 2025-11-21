import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [processingSession, setProcessingSession] = useState(false);

  useEffect(() => {
    // Check for session_id in URL fragment (from Google OAuth)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const sessionId = hashParams.get('session_id');
    
    if (sessionId && !processingSession) {
      processGoogleSession(sessionId);
    } else if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const register = async (userData) => {
    const response = await axios.post(`${API}/auth/register`, userData);
    const { access_token, user: newUser } = response.data;
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(newUser);
    return newUser;
  };

  const processGoogleSession = async (sessionId) => {
    setProcessingSession(true);
    setLoading(true);
    
    try {
      const response = await axios.post(`${API}/auth/google/session`, {
        session_id: sessionId
      });
      
      const { session_token, user: userData } = response.data;
      localStorage.setItem('token', session_token);
      setToken(session_token);
      setUser(userData);
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      console.error('Failed to process Google session:', error);
      alert('Google login failed. Please try again.');
    } finally {
      setProcessingSession(false);
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Call backend to delete session
      if (token) {
        await axios.post(`${API}/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    }
  };

  const updateProfile = async (profileData) => {
    const response = await axios.put(`${API}/auth/profile`, profileData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setUser(response.data);
    return response.data;
  };

  const updateDemographics = async (demographicsData) => {
    const response = await axios.put(`${API}/user/demographics`, demographicsData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Refresh user data
    await fetchUser();
    return response.data;
  };

  const getDemographics = async () => {
    const response = await axios.get(`${API}/user/demographics`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  };

  const getUserRating = async () => {
    const response = await axios.get(`${API}/user/rating`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  };

  const googleLogin = async (googleToken) => {
    const response = await axios.post(`${API}/auth/google/verify`, {
      credential: googleToken
    });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      token, 
      login, 
      register,
      googleLogin, 
      logout, 
      updateProfile,
      updateDemographics,
      getDemographics,
      getUserRating,
      processingSession
    }}>
      {children}
    </AuthContext.Provider>
  );
};