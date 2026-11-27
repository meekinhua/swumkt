import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

const GOOGLE_CLIENT_ID = '949663376782-cd9128nvekdavpu09mko30rfn9c2kre4.apps.googleusercontent.com';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

const toAppRoute = (target) => {
  if (!target) return '/dashboard';
  try {
    const u = new URL(target, window.location.origin);
    if (u.origin === window.location.origin) {
      return `${u.pathname}${u.search}${u.hash}` || '/dashboard';
    }
  } catch { /* relative path fallback */ }
  return target;
};

const GoogleLoginButton = ({ redirectUrl = '/dashboard', className = '', onSuccess }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { googleLogin } = useAuth();
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const refs = useRef({ onSuccess, googleLogin, redirectUrl, navigate, t });
  refs.current = { onSuccess, googleLogin, redirectUrl, navigate, t };

  const [ready, setReady] = useState(() => !!(typeof window !== 'undefined' && window.google?.accounts?.id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const renderGsi = useCallback(() => {
    if (!window.google?.accounts?.id || !btnRef.current) return;
    setErr('');
    setReady(true);
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: false,
      ux_mode: 'popup',
      callback: async (response) => {
        if (!response?.credential) return;
        setBusy(true);
        setErr('');
        try {
          const { googleLogin: doGoogleLogin, onSuccess: doneCb, redirectUrl: nextUrl, navigate: nav, t: tr } = refs.current;
          const userData = await doGoogleLogin(response.credential);
          toast.success(tr('auth.googleLoginSuccess', 'เข้าสู่ระบบด้วย Google สำเร็จ'));
          if (doneCb) {
            doneCb({ user: userData });
          } else {
            nav(toAppRoute(nextUrl));
          }
        } catch (error) {
          console.error('Google login error:', error);
          const msg = error?.response?.data?.detail || refs.current.t('auth.googleLoginError', 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองอีกครั้ง');
          setErr(msg);
          toast.error(msg);
        } finally {
          setBusy(false);
        }
      },
    });
    const w = Math.max(220, Math.min(400, Math.floor(wrapRef.current?.clientWidth || 320)));
    btnRef.current.innerHTML = '';
    window.google.accounts.id.renderButton(btnRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      locale: 'th',
      width: w,
    });
  }, []);

  const loadScriptAndRender = useCallback(() => {
    setErr('');
    if (window.google?.accounts?.id) {
      renderGsi();
      return () => {};
    }
    let alive = true;
    let script = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
    const onLoad = () => { if (alive) renderGsi(); };
    const onErr = () => {
      if (alive) setErr('โหลดปุ่ม Google ไม่สำเร็จ กรุณาปิดตัวบล็อกโฆษณาหรือรีเฟรชหน้าแล้วลองใหม่');
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onErr);
    // If script finished loading before listener attached
    if (window.google?.accounts?.id) onLoad();
    return () => {
      alive = false;
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onErr);
    };
  }, [renderGsi]);

  useEffect(() => loadScriptAndRender(), [loadScriptAndRender]);

  return (
    <div ref={wrapRef} className={`w-full ${className}`} data-testid="google-login-wrap">
      <div
        ref={btnRef}
        className="w-full flex justify-center"
        style={{ minHeight: 44 }}
        aria-label={t('auth.continueWithGoogle', 'ดำเนินการต่อด้วย Google')}
      />
      {!ready && !err && (
        <p className="text-xs text-center text-gray-500 mt-1">กำลังโหลดปุ่ม Google...</p>
      )}
      {busy && (
        <p className="text-xs text-center text-[#005A73] mt-1">กำลังเข้าสู่ระบบด้วยบัญชี Google...</p>
      )}
      {err && (
        <div className="mt-2 text-center space-y-1">
          <p className="text-xs text-red-600" role="alert">{err}</p>
          {!ready && (
            <Button type="button" variant="outline" size="sm" onClick={loadScriptAndRender}>
              ลองโหลดปุ่ม Google อีกครั้ง
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default GoogleLoginButton;
