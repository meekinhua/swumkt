// Main app — design canvas + tweaks
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "score": 68,
  "respondents": 127,
  "language": "mixed",
  "showLocked": false
}/*EDITMODE-END*/;

const App = () => {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  return (
    <>
      <DesignCanvas>
        <DCSection id="dashboard" title="Dashboard" subtitle="The main deliverable — Brand Equity Score, 4 dimension sections, AI insights">
          <DCArtboard id="dash-main" label="Dashboard · all 4 dimensions" width={1440} height={1980}>
            <Dashboard score={tweaks.score} language={tweaks.language}/>
          </DCArtboard>
        </DCSection>

        <DCSection id="entry" title="Entry & creation" subtitle="Studies list, study-creation wizard">
          <DCArtboard id="studies-list" label="Studies list · /brand-equity" width={1280} height={900}>
            <StudiesList/>
          </DCArtboard>
          <DCArtboard id="wizard-step4" label="Wizard step 4 · AI question review" width={1200} height={880}>
            <Wizard/>
          </DCArtboard>
        </DCSection>

        <DCSection id="respondent" title="Respondent · mobile" subtitle="What the surveyed person actually sees on their phone">
          <DCArtboard id="resp-q" label="Quality + Identity question" width={410} height={864}>
            <Respondent/>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Score state">
          <TweakSlider label="Brand Equity Score" value={tweaks.score} min={0} max={100} step={1}
            onChange={v => setTweak('score', v)} hint={tweaks.score >= 70 ? 'Healthy · green ring' : tweaks.score >= 40 ? 'At watch · gold ring' : 'At risk · red ring'}/>
        </TweakSection>
        <TweakSection title="Language">
          <TweakRadio value={tweaks.language} options={[
            { value: 'mixed', label: 'Mixed' },
            { value: 'th',    label: 'ไทย' },
            { value: 'en',    label: 'EN' },
          ]} onChange={v => setTweak('language', v)}/>
        </TweakSection>
      </TweaksPanel>
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
