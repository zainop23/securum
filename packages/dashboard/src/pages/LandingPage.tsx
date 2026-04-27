import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen relative" style={{ background: '#131313', color: '#e5e2e1' }}>
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="grid-overlay" />
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
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-8 py-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(190,242,100,0.08)' }}>
        <div className="flex items-center gap-8">
          <span style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#bef264', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif" }}>Securum</span>
          <div className="hidden md:flex gap-6">
            <a href="#features" style={{ color: '#bef264', borderBottom: '2px solid #bef264', paddingBottom: '4px', fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.9rem', letterSpacing: '-0.01em' }}>Platform</a>
            <a href="#how-it-works" style={{ color: '#71717a', fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.9rem', letterSpacing: '-0.01em' }} className="hover:text-lime-300 transition-colors">Security</a>
            <a href="#features" style={{ color: '#71717a', fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.9rem', letterSpacing: '-0.01em' }} className="hover:text-lime-300 transition-colors">Solutions</a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <Link to="/dashboard" className="btn-primary" style={{ padding: '8px 24px' }}>Dashboard</Link>
          ) : (
            <>
              <Link to="/login" style={{ color: '#71717a', fontWeight: 500, fontSize: '0.9rem' }} className="hover:text-white transition-colors">Login</Link>
              <Link to="/signup" className="btn-primary" style={{ padding: '8px 24px', fontSize: '0.7rem' }}>Get Started</Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-24 px-8 relative z-10">
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-4">
                <span style={{ width: 8, height: 8, background: '#bef264', borderRadius: '50%' }} className="animate-pulse" />
                <span style={{ fontFamily: 'monospace', color: '#bef264', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.7rem' }}>System Active: Privacy-Preserving Analytics</span>
              </div>
              <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#e5e2e1', marginBottom: '1.5rem', maxWidth: '40rem' }}>
                Uncompromising <span style={{ color: '#bef264' }}>Digital Fortification</span> for Joint Analytics.
              </h1>
              <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: '#a1a1aa', marginBottom: '2.5rem', maxWidth: '32rem' }}>
                Real-time differential privacy, autonomous commit-reveal protocols, and zero-trust architecture designed for multi-organization secure analytics.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/signup" className="btn-primary" style={{ padding: '16px 32px', fontSize: '0.8rem' }}>
                  Deploy Protocol <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>terminal</span>
                </Link>
                <Link to="/login" className="btn-secondary" style={{ padding: '16px 32px', fontSize: '0.8rem' }}>
                  View Analytics
                </Link>
              </div>
            </div>
            <div className="lg:col-span-5 relative">
              <div className="relative overflow-hidden" style={{ border: '1px solid rgba(190,242,100,0.1)', background: 'rgba(14,14,14,0.5)', backdropFilter: 'blur(8px)' }}>
                <div style={{ padding: '2rem' }}>
                  {/* Fake terminal / stats display */}
                  <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#bef264', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem' }}>NETWORK_STATUS</div>
                  <div className="flex justify-between items-end" style={{ marginBottom: '2rem' }}>
                    <div>
                      <div style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: '#71717a', marginBottom: '0.25rem' }}>LATENCY</div>
                      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif" }}>12ms</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: '#71717a' }}>Uptime: 99.9999%</div>
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
                      { label: 'Encrypted Tunnel Alpha', status: 'SYNC', color: '#bef264' },
                      { label: 'Commit Phase Active', status: 'ALLOW', color: '#4edea3' },
                      { label: 'DP Noise Applied ε=1.0', status: 'ACTIVE', color: '#4edea3' },
                      { label: 'External API Call', status: 'FILTER', color: '#ffb4ab' },
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
      <section className="py-16 px-8 relative z-10">
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Large Focus Card */}
            <div className="md:col-span-2" style={{ background: 'rgba(28,27,27,0.8)', border: '1px solid rgba(190,242,100,0.08)', padding: '2rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 16, right: 16, opacity: 0.05 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 120 }}>security</span>
              </div>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 600, color: '#e5e2e1', marginBottom: '0.75rem' }}>Autonomous Defense Matrix</h2>
              <p style={{ fontSize: '0.9rem', color: '#a1a1aa', maxWidth: '28rem', lineHeight: 1.6 }}>Our commit-reveal protocol ensures data integrity. Differential privacy mathematically guarantees individual record protection.</p>
              <div className="flex gap-8 mt-8">
                {[
                  { label: 'Privacy Budget', value: 'ε-tracked', accent: true },
                  { label: 'Active Nodes', value: '3+' },
                  { label: 'Response Time', value: '<5s' },
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
                <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#131f00' }}>arrow_outward</span>
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
      <section id="features" className="py-16 px-8 relative z-10">
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <div id="how-it-works" className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
      <section className="py-16 px-8 relative z-10" style={{ borderTop: '1px solid rgba(190,242,100,0.08)' }}>
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
      <footer className="py-12 px-8 relative z-10" style={{ background: 'rgba(10,10,10,0.9)', borderTop: '1px solid rgba(190,242,100,0.08)' }}>
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
