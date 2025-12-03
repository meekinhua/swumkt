import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  const [authError, setAuthError] = useState(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    // Check for session_id in URL fragment (from Google OAuth)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const sessionId = hashParams.get('session_id');
    
    // Check for session expired flag
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('session_expired') === 'true') {
      setAuthError('Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    if (sessionId && !processingSession) {
      processGoogleSession(sessionId);
    } else if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    // Prevent duplicate fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000 // 15 second timeout for auth
      });
      setUser(response.data);
      setAuthError(null);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      if (error.response?.status === 401) {
        // Token is invalid
        logout();
        setAuthError('Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else if (error.code === 'ECONNABORTED') {
        // Timeout - don't logout, just show error
        setAuthError('การเชื่อมต่อหมดเวลา กรุณารีเฟรชหน้า');
      } else {
        // Other error - try to keep session if possible
        setAuthError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  const login = async (email, password) => {
    setAuthError(null);
    const response = await axios.post(`${API}/auth/login`, { email, password }, {
      timeout: 15000
    });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const register = async (userData) => {
    setAuthError(null);
    const response = await axios.post(`${API}/auth/register`, userData, {
      timeout: 15000
    });
    const { access_token, user: newUser } = response.data;
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(newUser);
    return newUser;
  };

  const processGoogleSession = async (sessionId) => {
    setProcessingSession(true);
    setLoading(true);
    setAuthError(null);
    
    try {
      const response = await axios.post(`${API}/auth/google/session`, {
        session_id: sessionId
      }, {
        timeout: 15000
      });
      
      const { session_token, user: userData } = response.data;
      localStorage.setItem('token', session_token);
      setToken(session_token);
      setUser(userData);
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      console.error('Failed to process Google session:', error);
      setAuthError('Google login ล้มเหลว กรุณาลองใหม่อีกครั้ง');
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
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000 // Short timeout for logout
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with logout even if backend fails
    } finally {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    }
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  const updateProfile = async (profileData) => {
    const response = await axios.put(`${API}/auth/profile`, profileData, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    });
    // Create new object to force re-render
    setUser({...response.data});
    return response.data;
  };

  const updateDemographics = async (demographicsData) => {
    const response = await axios.put(`${API}/user/demographics`, demographicsData, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    });
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