import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();
  const [activeSection, setActiveSection] = useState('platform');

  useEffect(() => {
    const sectionIds = ['platform', 'security', 'solutions'];
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);

    if (sections.length === 0) return;

    const updateActiveSection = () => {
      const navOffset = 120;
      const scrollY = window.scrollY + navOffset;

      let current = sectionIds[0];
      for (const section of sections) {
        if (section.offsetTop <= scrollY) {
          current = section.id;
        }
      }
      setActiveSection(current);
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);

    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, []);

  const navLinks = [
    { id: 'platform', label: 'Platform' },
    { id: 'security', label: 'Security' },
    { id: 'solutions', label: 'Solutions' },
  ];

  const backgroundClusters = [
    { top: '6%', left: '4%', size: 52, opacity: 0.14 },
    { top: '9%', left: '16%', size: 58, opacity: 0.16 },
    { top: '12%', left: '31%', size: 50, opacity: 0.13 },
    { top: '15%', left: '47%', size: 56, opacity: 0.15 },
    { top: '10%', left: '66%', size: 48, opacity: 0.12 },
    { top: '18%', left: '82%', size: 62, opacity: 0.16 },
    { top: '22%', left: '8%', size: 54, opacity: 0.14 },
    { top: '27%', left: '23%', size: 46, opacity: 0.12 },
    { top: '31%', left: '39%', size: 60, opacity: 0.16 },
    { top: '34%', left: '14%', size: 68, opacity: 0.18 },
    { top: '36%', left: '58%', size: 52, opacity: 0.14 },
    { top: '42%', left: '72%', size: 48, opacity: 0.12 },
    { top: '46%', left: '88%', size: 58, opacity: 0.15 },
    { top: '49%', left: '3%', size: 50, opacity: 0.13 },
    { top: '56%', left: '6%', size: 72, opacity: 0.17 },
    { top: '59%', left: '29%', size: 56, opacity: 0.15 },
    { top: '64%', left: '45%', size: 52, opacity: 0.14 },
    { top: '68%', left: '79%', size: 66, opacity: 0.16 },
    { top: '71%', left: '63%', size: 48, opacity: 0.12 },
    { top: '76%', left: '11%', size: 54, opacity: 0.14 },
    { top: '78%', left: '26%', size: 60, opacity: 0.15 },
    { top: '82%', left: '51%', size: 46, opacity: 0.12 },
    { top: '88%', left: '64%', size: 64, opacity: 0.16 },
    { top: '91%', left: '84%', size: 50, opacity: 0.13 },
    // additional middle clusters
    { top: '48%', left: '44%', size: 44, opacity: 0.20 },
    { top: '52%', left: '50%', size: 62, opacity: 0.22 },
    { top: '56%', left: '47%', size: 38, opacity: 0.18 },
    { top: '50%', left: '55%', size: 48, opacity: 0.20 },
    { top: '46%', left: '52%', size: 54, opacity: 0.21 },
  ];

  return (
    <div className="min-h-screen relative" style={{ background: '#131313', color: '#e5e2e1' }}>
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="grid-overlay" />
        <div className="absolute inset-0">
          {backgroundClusters.map((cluster, idx) => {
            const speedClass = idx % 5 === 0 ? 'rot-fast' : idx % 3 === 0 ? 'rot-medium' : 'rot-slow';
            const revClass = idx % 7 === 0 ? 'rot-rev' : '';
            return (
              <svg
                key={idx}
                className={`bg-cluster ${speedClass} ${revClass}`}
                viewBox="0 0 100 100"
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: cluster.top,
                  left: cluster.left,
                  width: `${cluster.size}px`,
                  height: `${cluster.size}px`,
                  opacity: cluster.opacity,
                  transformOrigin: '50% 50%',
                }}
              >
                <line x1="18" y1="24" x2="52" y2="16" stroke="rgba(190,242,100,0.44)" strokeWidth="1" />
                <line x1="52" y1="16" x2="78" y2="42" stroke="rgba(190,242,100,0.44)" strokeWidth="1" />
                <line x1="78" y1="42" x2="61" y2="74" stroke="rgba(190,242,100,0.44)" strokeWidth="1" />
                <line x1="61" y1="74" x2="26" y2="68" stroke="rgba(190,242,100,0.44)" strokeWidth="1" />
                <line x1="26" y1="68" x2="18" y2="24" stroke="rgba(190,242,100,0.44)" strokeWidth="1" />

                <circle cx="18" cy="24" r="2.3" fill="rgba(190,242,100,0.9)" />
                <circle cx="52" cy="16" r="2.5" fill="rgba(190,242,100,0.95)" />
                <circle cx="78" cy="42" r="2.3" fill="rgba(190,242,100,0.9)" />
                <circle cx="61" cy="74" r="2.4" fill="rgba(190,242,100,0.94)" />
                <circle cx="26" cy="68" r="2.2" fill="rgba(190,242,100,0.88)" />
              </svg>
            );
          })}
        </div>
        <div
          className="absolute rounded-full"
          style={{
            top: '-15rem', right: '-10rem',
            width: '40rem', height: '40rem',
            background: 'radial-gradient(circle, rgba(190,242,100,0.06) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: '-15rem', left: '-10rem',
            width: '35rem', height: '35rem',
            background: 'radial-gradient(circle, rgba(78,222,163,0.04) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 px-4 sm:px-6 lg:px-8" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(190,242,100,0.08)' }}>
        <div className="flex justify-between items-center py-4" style={{ maxWidth: '80rem', margin: '0 auto' }}>
        <div className="flex items-center gap-8">
          <Link
            to="/"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#bef264', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif", textDecoration: 'none' }}
          >
            Securum
          </Link>
          <div className="hidden md:flex gap-6">
            {navLinks.map((link) => {
              const isActive = activeSection === link.id;
              return (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  style={{
                    color: isActive ? '#bef264' : '#71717a',
                    borderBottom: isActive ? '2px solid #bef264' : '2px solid transparent',
                    paddingBottom: '4px',
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '0.9rem',
                    letterSpacing: '-0.01em',
                  }}
                  className="hover:text-lime-300 transition-colors"
                >
                  {link.label}
                </a>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          {isAuthenticated ? (
            <>
              <div
                style={{
                  border: '1px solid rgba(190,242,100,0.2)',
                  background: 'rgba(190,242,100,0.08)',
                  color: '#bef264',
                  padding: '0.4rem 0.7rem',
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  whiteSpace: 'nowrap',
                  maxWidth: '11rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={user?.orgName || 'No organization'}
              >
                {user?.orgName || 'No Organization'}
              </div>
              <Link to="/dashboard" className="btn-primary" style={{ padding: '8px 18px', fontSize: '0.68rem' }}>Dashboard</Link>
            </>
          ) : (
            <>
              <Link to="/signup" className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.68rem' }}>Create Organization</Link>
              <Link to="/login" className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.68rem' }}>Sign In</Link>
            </>
          )}
        </div>
        </div>
      </nav>

      {/* Fixed-nav spacer so top content is never hidden */}
      <div style={{ height: '84px' }} aria-hidden="true" />

      {/* Hero Section */}
      <section className="landing-section pt-16 sm:pt-20 pb-16 sm:pb-24 px-4 sm:px-6 lg:px-8 relative z-10">
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-4">
                <span style={{ width: 8, height: 8, background: '#bef264', borderRadius: '50%' }} className="animate-pulse" />
                <span style={{ fontFamily: 'monospace', color: '#bef264', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.7rem' }}>SECURE. SELF-HOSTED. JOINT ANALYTICS</span>
              </div>
              <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#e5e2e1', marginBottom: '1.5rem', maxWidth: '40rem' }}>
                Privacy-preserving <span style={{ color: '#bef264' }}>Joint Analytics</span> for Multi-Organization Collaboration.
              </h1>
              <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: '#a1a1aa', marginBottom: '2.5rem', maxWidth: '32rem' }}>
                Securum is a privacy-preserving analytics platform. A central orchestration service coordinates queries and secure aggregation, while distributed organization nodes perform local computation, schema mapping, and differential-privacy noise injection. This dashboard displays system status, privacy budget, node health, and deployment readiness for operational monitoring.
              </p>
            </div>
            <div className="lg:col-span-5 relative">
              <div className="relative overflow-hidden" style={{ border: '1px solid rgba(190,242,100,0.1)', background: 'rgba(14,14,14,0.5)', backdropFilter: 'blur(8px)' }}>
                <div style={{ padding: '2rem' }}>
                  {/* Fake terminal / stats display */}
                  <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#bef264', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem' }}>NETWORK_STATUS</div>
                  <div className="flex justify-between items-end" style={{ marginBottom: '2rem' }}>
                    <div>
                        <div style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: '#71717a', marginBottom: '0.25rem' }}>NODE LATENCY (SAMPLE)</div>
                          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif" }}>12ms (local)</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: '#71717a' }}>Coordinator: running (dev)</div>
                      <div className="flex gap-1 mt-2 justify-end">
                        {[4, 6, 3, 5, 7, 4, 6].map((h, i) => (
                          <div key={i} style={{ height: h * 4, width: 3, background: '#bef264' }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Live traffic mock */}
                  <div style={{ borderTop: '1px solid rgba(190,242,100,0.08)', paddingTop: '1rem' }}>
                    {[
                      { label: 'Coordinator', status: 'RUNNING', color: '#bef264' },
                      { label: 'Commit-Reveal', status: 'ACTIVE', color: '#4edea3' },
                      { label: 'DP Noise ε', status: '1.0', color: '#4edea3' },
                      { label: 'Postgres DB', status: 'SEEDED', color: '#ffb4ab' },
                    ].map((item, i) => (
                      <div key={i} className="flex justify-between items-center" style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(190,242,100,0.05)' }}>
                        <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>{item.label}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: item.color }}>{item.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="platform" className="landing-section mt-8 sm:mt-10 py-14 sm:py-16 px-4 sm:px-6 lg:px-8 relative z-10" style={{ scrollMarginTop: '110px' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Large Focus Card */}
            <div className="md:col-span-2" style={{ background: 'rgba(28,27,27,0.8)', border: '1px solid rgba(190,242,100,0.08)', padding: '2rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 16, right: 16, opacity: 0.05 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 120 }}>security</span>
              </div>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 600, color: '#e5e2e1', marginBottom: '0.75rem' }}>Autonomous Defense Matrix</h2>
              <p style={{ fontSize: '0.9rem', color: '#a1a1aa', maxWidth: '28rem', lineHeight: 1.6 }}>Coordinator and org nodes implement commit-reveal aggregation, schema mapping, and DP noise insertion. See `packages/coordinator`, `packages/org-node`, and `shared` for core logic and tests.</p>
              <div className="flex gap-8 mt-8">
                  {[
                  { label: 'Privacy Budget', value: 'ε = 1.0 (default)', accent: true },
                  { label: 'Active Nodes', value: 'org-node x3 (dev)' },
                  { label: 'Response Time', value: '<5s (estimate)' },
                ].map((stat, i) => (
                  <div key={i} style={{ borderLeft: `2px solid ${stat.accent ? '#bef264' : 'rgba(190,242,100,0.15)'}`, paddingLeft: '1rem' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#71717a', textTransform: 'uppercase' }}>{stat.label}</div>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.25rem', fontWeight: 600, color: stat.accent ? '#bef264' : '#e5e2e1' }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA Card */}
            <div style={{ background: '#bef264', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }} className="group">
              <div className="flex justify-between items-start">
                <span className="material-symbols-outlined" style={{ fontSize: '2rem', color: '#131f00' }}>shield_lock</span>
                <Link
                  to="/register"
                  aria-label="Go to register"
                  style={{ color: '#131f00', display: 'inline-flex' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#131f00' }}>arrow_outward</span>
                </Link>
              </div>
              <div style={{ marginTop: '2rem' }}>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', fontWeight: 600, color: '#131f00', lineHeight: 1.3, marginBottom: '0.5rem' }}>Start Your Organization</h3>
                <p style={{ fontSize: '0.85rem', color: '#354e00', opacity: 0.8 }}>Register, onboard your node, and run your first privacy-preserving query in minutes.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features / How it Works */}
      <section id="security" className="landing-section mt-8 sm:mt-10 py-14 sm:py-16 px-4 sm:px-6 lg:px-8 relative z-10" style={{ scrollMarginTop: '110px' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: 'encrypted',
                tag: 'VERIFIED',
                title: 'Differential Privacy',
                desc: 'Laplace noise mechanism provides formal privacy guarantees. Each query consumes epsilon from a trackable budget.',
              },
              {
                icon: 'sync_lock',
                tag: 'LIVE',
                title: 'Commit-Reveal Protocol',
                desc: 'Cryptographic commitment scheme prevents result tampering. SHA-256 verification ensures data integrity across all nodes.',
              },
              {
                icon: 'cloud_done',
                tag: 'SELF-HOSTED',
                title: 'Your Data, Your Rules',
                desc: 'Organizations keep raw data on their own infrastructure. Only noisy aggregates are shared through the secure pipeline.',
              },
            ].map((feature, i) => (
              <div key={i} style={{ border: '1px solid rgba(190,242,100,0.08)', background: 'rgba(28,27,27,0.5)', overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <span style={{ background: 'rgba(78,222,163,0.15)', color: '#4edea3', border: '1px solid rgba(78,222,163,0.2)', padding: '2px 8px', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{feature.tag}</span>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: '#bef264' }}>{feature.icon}</span>
                    <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1rem', fontWeight: 600, color: '#e5e2e1' }}>{feature.title}</h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#a1a1aa', lineHeight: 1.6 }}>{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA / Newsletter */}
      <section id="solutions" className="landing-section mt-12 sm:mt-14 py-14 sm:py-16 px-4 sm:px-6 lg:px-8 relative z-10" style={{ borderTop: '1px solid rgba(190,242,100,0.08)', scrollMarginTop: '110px' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-end">
            <div>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '2rem', fontWeight: 700, color: '#e5e2e1', marginBottom: '0.75rem' }}>Ready to Deploy?</h2>
              <p style={{ fontSize: '0.95rem', color: '#a1a1aa', maxWidth: '28rem' }}>Register your organization, connect your node, and start running privacy-preserving joint analytics in minutes.</p>
            </div>
            <div className="flex gap-4">
              <Link to="/signup" className="btn-primary" style={{ padding: '16px 32px' }}>Create Organization</Link>
              <Link to="/login" className="btn-secondary" style={{ padding: '16px 32px' }}>Sign In</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 relative z-10" style={{ background: 'rgba(10,10,10,0.9)', borderTop: '1px solid rgba(190,242,100,0.08)' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto' }} className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#bef264', fontFamily: "'Space Grotesk', sans-serif" }}>Securum</span>
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#52525b' }}>© 2024 Securum. Command Center precision.</p>
          </div>
          <div className="flex gap-8">
            {['Terms', 'Privacy', 'Status', 'Contact'].map((item) => (
              <a key={item} href="#" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#52525b' }} className="hover:text-white transition-colors">{item}</a>
            ))}
          </div>
          <div className="flex gap-4">
            {['public', 'security', 'database'].map((icon) => (
              <span key={icon} className="material-symbols-outlined hover:text-lime-400 transition-colors cursor-pointer" style={{ color: '#52525b' }}>{icon}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
