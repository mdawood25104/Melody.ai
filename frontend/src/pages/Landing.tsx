/** Public-facing home page and product overview. */

import { Brand, Icon, Waveform } from "../components/Visuals";

export function Landing({ onAuth }: { onAuth: (mode: "register" | "login") => void }) {
  return <main className="landing">
    <header className="site-header">
      <div className="site-nav"><Brand onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
        <nav className="public-nav" aria-label="Main navigation">
          <a href="#home">Home</a><a href="#about">About</a>
          <button className="button button-primary button-nav" onClick={() => onAuth("register")}>Try it now <Icon name="arrow" size={16} /></button>
          <button className="button button-outline button-nav" onClick={() => onAuth("login")}>Sign in</button>
        </nav>
      </div>
    </header>
    <section className="hero-section" id="home">
      <div className="hero-glow hero-glow-one" /><div className="hero-glow hero-glow-two" />
      <div className="hero-content">
        <div className="eyebrow"><span className="eyebrow-dot" /> YOUR IDEAS, IN FULL COLOR</div>
        <h1>Make music<br />that <span className="text-gradient">feels like you.</span></h1>
        <p className="hero-copy">Turn the sound in your head into a song you can actually hear. One idea, a little imagination, and you’re off.</p>
        <div className="hero-actions"><button className="button button-primary button-large" onClick={() => onAuth("register")}>Create your first song <Icon name="arrow" size={18} /></button><a className="text-link" href="#about">See how it works <span>↓</span></a></div>
        <div className="hero-note"><span className="avatar-stack"><i>M</i><i>J</i><i>A</i></span><span>For daydreamers, playlist makers &amp; almost-musicians.</span></div>
      </div>
      <div className="hero-art" aria-label="Abstract music artwork">
        <div className="orbit orbit-outer" /><div className="orbit orbit-inner" />
        <div className="art-disc"><div className="disc-lines" /><div className="disc-center"><Icon name="wave" size={34} /></div></div>
        <div className="floating-note note-one">♪</div><div className="floating-note note-two">♫</div><div className="floating-note note-three">✳</div>
        <div className="now-playing"><span className="playing-icon"><Icon name="music" size={17} /></span><div><b>something from nothing</b><small>your next favorite song</small></div><span className="playing-bars"><i /><i /><i /><i /></span></div>
        <div className="art-caption">A whole new kind of <span>playlist.</span></div>
      </div>
      <div className="hero-scroll"><span /> SCROLL TO EXPLORE</div>
    </section>
    <section className="about-section" id="about">
      <div className="section-heading"><div className="eyebrow"><span className="eyebrow-dot" /> THE IDEA IS YOURS</div><h2>From a passing thought<br />to a <span className="text-gradient">full-on feeling.</span></h2><p>No instruments, studio, or music theory required. Just bring a feeling and let the creative part begin.</p></div>
      <div className="feature-grid">
        <article className="feature-card feature-prompt"><div className="feature-icon"><Icon name="wand" size={22} /></div><span className="feature-index">01 / THE IDEA</span><h3>Start with a feeling.</h3><p>A rainy-day thought? A made-up movie soundtrack? Describe what you hear. We’ll help turn a few words into a direction.</p><div className="mini-prompt"><span>♪</span> hazy afternoon, warm guitar, no rush</div></article>
        <article className="feature-card feature-write"><div className="feature-icon"><Icon name="spark" size={22} /></div><span className="feature-index">02 / THE DETAILS</span><h3>Make it yours.</h3><p>Pick a style, set the mood, add lyrics, or keep it instrumental. Tweak the ingredients until it sounds like your kind of magic.</p><div className="mini-tags"><span>Dream pop</span><span>+ Warm</span><span>+ You</span></div></article>
        <article className="feature-card feature-sound"><div className="feature-icon"><Icon name="headphones" size={22} /></div><span className="feature-index">03 / THE SOUND</span><h3>Press play on an idea.</h3><p>Your description becomes an original AI-generated track. Keep the ones you love, make another, and build a library that’s yours.</p><div className="feature-wave"><Waveform bars={24} /></div></article>
      </div>
    </section>
    <section className="cta-section"><div className="cta-noise" /><div className="eyebrow"><span className="eyebrow-dot" /> YOUR NEXT FAVORITE SONG ISN'T MADE YET</div><h2>Maybe it starts<br />with <span>you.</span></h2><button className="button button-dark button-large" onClick={() => onAuth("register")}>Make something <Icon name="arrow" size={18} /></button><div className="cta-orb">♫</div></section>
    <footer className="site-footer"><Brand onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} /><span>Made for the music in your head.</span><button onClick={() => onAuth("login")}>Sign in <Icon name="arrow" size={14} /></button><small>Design &amp; Developed by Tekkdev</small><small>© {new Date().getFullYear()} MelodyAI</small></footer>
  </main>;
}
