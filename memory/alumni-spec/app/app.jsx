// ============== MAIN APP ==============
const App = () => {
  const [screen, setScreen] = useState(() => {
    return localStorage.getItem('mkt-swu-screen') || window.TWEAKS?.startScreen || 'landing';
  });
  const [tweaks, setTweaks] = useState(window.TWEAKS || {});
  const [tweaksVisible, setTweaksVisible] = useState(false);

  useEffect(() => {
    localStorage.setItem('mkt-swu-screen', screen);
  }, [screen]);

  // Tweaks protocol
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksVisible(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksVisible(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  // Apply theme
  useEffect(() => {
    document.body.className = tweaks.theme === 'dark' ? 'theme-dark' : '';
    if (tweaks.accent === 'blue') {
      document.body.style.setProperty('--red', '#1B75BC');
      document.body.style.setProperty('--red-ink', '#0E4F83');
      document.body.style.setProperty('--red-soft', '#E3F0FA');
    } else {
      document.body.style.removeProperty('--red');
      document.body.style.removeProperty('--red-ink');
      document.body.style.removeProperty('--red-soft');
    }
  }, [tweaks.theme, tweaks.accent]);

  const nav = (id) => setScreen(id);
  const isMobile = useIsMobile();

  return (
    <div className="app" data-screen-label={screen}>
      <TopNav current={screen} onNav={nav} />

      <div style={{ flex: 1, paddingBottom: isMobile ? 68 : 40 }}>
        {screen === 'landing' && <ScreenLanding onNav={nav} />}
        {screen === 'onboarding' && <ScreenOnboarding onNav={nav} />}
        {screen === 'tree' && <ScreenTree onNav={nav} />}
        {screen === 'discover' && <ScreenDiscover onNav={nav} />}
        {screen === 'feed' && <ScreenFeed onNav={nav} />}
        {screen === 'jobs' && <ScreenJobs onNav={nav} />}
        {screen === 'profile' && <ScreenProfile onNav={nav} />}
      </div>

      {isMobile && <BottomNav current={screen} onNav={nav} />}

      <TweaksPanel visible={tweaksVisible} tweaks={tweaks} setTweaks={setTweaks} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
