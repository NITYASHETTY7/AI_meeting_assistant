/**
 * AI Meeting Assistant — High-Fidelity Interactive Script
 * Engineered by Mirai Labs
 */

document.addEventListener('DOMContentLoaded', () => {
  initNeuralCanvas();
  initCursorGlow();
  initHeroWaveform();
  initPlatformSwitcher();
  initHeroEmailModal();
  initTemplateSuite();
  initInteractiveExperience();
  initFaqAccordion();
  initTiltCards();
  initHeroTimer();
});

/* ══════════ 1 · NEURAL PARTICLES CANVAS ══════════ */
function initNeuralCanvas() {
  const canvas = document.getElementById('neuralCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const count = Math.min(Math.floor(width / 24), 50);

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 1.5 + 1
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    // Draw connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 140) {
          const alpha = (1 - dist / 140) * 0.12;
          ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw particles
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.fillStyle = 'rgba(40, 152, 235, 0.4)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

/* ══════════ 2 · AMBIENT CURSOR GLOW ══════════ */
function initCursorGlow() {
  const glow = document.getElementById('cursorGlow');
  if (!glow) return;

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let curX = x, curY = y;

  window.addEventListener('mousemove', (e) => {
    x = e.clientX;
    y = e.clientY;
  });

  function loop() {
    curX += (x - curX) * 0.1;
    curY += (y - curY) * 0.1;
    glow.style.left = `${curX}px`;
    glow.style.top = `${curY}px`;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

/* ══════════ 3 · REALISTIC 60FPS ORGANIC SPEECH WAVEFORM ══════════ */
function initHeroWaveform() {
  const container = document.getElementById('heroSoundwave');
  const speakerLabel = document.getElementById('heroActiveSpeaker');
  if (!container) return;

  const count = 30;
  const bars = [];
  const currentScales = new Float32Array(count).fill(0.15);
  const targetScales = new Float32Array(count).fill(0.15);

  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    container.appendChild(bar);
    bars.push(bar);
  }

  let time = 0;
  let speakerTimer = 0;
  let isYouSpeaker = true;

  function animateWaveform() {
    time += 0.04;
    speakerTimer += 0.016;

    // Realistic speech cadence: natural 2.6s speaking burst followed by 0.7s breath/micro-pause
    const cycle = (time * 0.7) % (Math.PI * 2);
    // Envelope rises and falls naturally like human vocal sentences
    const voiceEnvelope = Math.max(0.1, Math.sin(cycle) * 0.7 + 0.3);

    for (let i = 0; i < count; i++) {
      // Bell curve: vocal formant frequencies centered in the middle of spectrum
      const norm = (i - count / 2) / (count / 2.2);
      const bellCurve = Math.exp(-norm * norm);

      // Multi-harmonic subtle speech resonance
      const wave1 = Math.sin(time * 2.2 + i * 0.35);
      const wave2 = Math.cos(time * 1.6 - i * 0.25);
      const wave3 = Math.sin(time * 4.0 + i * 0.7) * 0.3;

      const rawIntensity = ((wave1 + wave2 + wave3 + 2.3) / 4.6);
      targetScales[i] = Math.max(0.12, Math.min(0.95, (rawIntensity * bellCurve * voiceEnvelope * 0.85) + 0.12));

      // Smooth 60fps linear interpolation (lerp) for organic fluidity
      currentScales[i] += (targetScales[i] - currentScales[i]) * 0.18;
      bars[i].style.transform = `scaleY(${currentScales[i].toFixed(3)})`;
    }

    // Toggle active speaker naturally every 7 seconds
    if (speakerTimer > 6.5 && speakerLabel) {
      speakerTimer = 0;
      isYouSpeaker = !isYouSpeaker;
      if (isYouSpeaker) {
        speakerLabel.innerHTML = `<span class="speaker-dot"></span> Active: <strong class="you-text">You (Microphone)</strong>`;
        bars.forEach(b => b.style.background = 'linear-gradient(180deg, var(--accent-cyan), var(--accent-blue))');
      } else {
        speakerLabel.innerHTML = `<span class="speaker-dot" style="background:var(--accent-indigo);box-shadow:0 0 6px var(--accent-indigo)"></span> Active: <strong class="speaker-text">Speaker (System Audio)</strong>`;
        bars.forEach(b => b.style.background = 'linear-gradient(180deg, var(--accent-indigo), #818cf8)');
      }
    }

    requestAnimationFrame(animateWaveform);
  }

  requestAnimationFrame(animateWaveform);
}

/* ══════════ 4 · TEMPLATES SHOWCASE ENGINE ══════════ */
const TEMPLATE_DATA = {
  candidate: {
    title: 'Candidate Evaluation Scorecard',
    tag: '5-Star Hiring Rubric',
    verdict: '⭐ Verdict: Strong Hire (Staff Backend)',
    html: `
      <div class="tmpl-grid-2col">
        <div class="tmpl-rubric-card">
          <div class="rubric-row">
            <span class="rubric-label">Distributed Systems &amp; Cache Coherence</span>
            <span class="rubric-score">5.0 / 5.0 ★★★★★</span>
          </div>
          <div class="rubric-row">
            <span class="rubric-label">Concurrency, Mutex &amp; Scale (20k RPS)</span>
            <span class="rubric-score">4.8 / 5.0 ★★★★★</span>
          </div>
          <div class="rubric-row">
            <span class="rubric-label">System Architecture &amp; Database Partitioning</span>
            <span class="rubric-score">5.0 / 5.0 ★★★★★</span>
          </div>
          <div class="rubric-row">
            <span class="rubric-label">Technical Articulation &amp; Clarity</span>
            <span class="rubric-score">5.0 / 5.0 ★★★★★</span>
          </div>
        </div>

        <div class="tmpl-summary-box">
          <h4>Interview Summary &amp; Key Evidence</h4>
          <ul class="tmpl-bullet-list">
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>Caching Strategy:</strong> Articulated multi-tier caching (L1 Caffeine in-memory + L2 Redis broadcast invalidation).</span>
            </li>
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>Thundering Herd:</strong> Demonstrated deep mastery of XFetch probabilistic early refresh algorithm.</span>
            </li>
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>Next Step:</strong> Schedule final executive discussion with VP of Engineering.</span>
            </li>
          </ul>
        </div>
      </div>
    `
  },

  discovery: {
    title: 'Client Requirements Discovery & Scope',
    tag: 'Project Charter & Architecture',
    verdict: 'Budget Cap: $8,000 / Month',
    html: `
      <div class="tmpl-grid-2col">
        <div class="tmpl-summary-box">
          <h4>Core Requirements &amp; Architecture Scope</h4>
          <ul class="tmpl-bullet-list">
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>Database Topology:</strong> PostgreSQL migration to AWS Aurora Serverless v2 with multi-AZ replication.</span>
            </li>
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>Container Orchestration:</strong> AWS ECS Fargate microservices deployment.</span>
            </li>
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>Downtime Mandate:</strong> Zero downtime migration funded via AWS MAP partner credits.</span>
            </li>
          </ul>
        </div>

        <div class="tmpl-rubric-card">
          <div class="rubric-row">
            <span class="rubric-label">Target Cloud Spend</span>
            <span class="rubric-score" style="color:var(--accent-cyan)">$8,000 / mo Cap</span>
          </div>
          <div class="rubric-row">
            <span class="rubric-label">SOW Delivery Date</span>
            <span class="rubric-score" style="color:var(--accent-cyan)">This Thursday</span>
          </div>
          <div class="rubric-row">
            <span class="rubric-label">IAM Access Handoff</span>
            <span class="rubric-score" style="color:var(--accent-cyan)">This Friday</span>
          </div>
          <div class="rubric-row">
            <span class="rubric-label">Status</span>
            <span class="rubric-score" style="color:var(--accent-cyan)">Approved</span>
          </div>
        </div>
      </div>
    `
  },

  hr: {
    title: 'HR Strategy & 1:1 Sync',
    tag: 'Engineering Career Ladder & Morale',
    verdict: 'Morale Index: High (4.9/5)',
    html: `
      <div class="tmpl-grid-2col">
        <div class="tmpl-summary-box">
          <h4>Discussion Notes &amp; Growth Milestones</h4>
          <ul class="tmpl-bullet-list">
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>Career Progression:</strong> Finalized Individual Contributor (IC) technical ladder rollout for Q3.</span>
            </li>
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>Innovation Days:</strong> Approved 2 dedicated research days per sprint for engineering squads.</span>
            </li>
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>Knowledge Sharing:</strong> Launching bi-weekly Demo Fridays across tech squads.</span>
            </li>
          </ul>
        </div>

        <div class="tmpl-rubric-card">
          <div class="rubric-row">
            <span class="rubric-label">Team Engagement</span>
            <span class="rubric-score">4.9 / 5.0 ★★★★★</span>
          </div>
          <div class="rubric-row">
            <span class="rubric-label">Handbook Memo Release</span>
            <span class="rubric-score" style="color:var(--accent-cyan)">Next Tuesday</span>
          </div>
          <div class="rubric-row">
            <span class="rubric-label">Lead IC Alignment</span>
            <span class="rubric-score" style="color:var(--accent-cyan)">Complete</span>
          </div>
        </div>
      </div>
    `
  },

  standup: {
    title: 'Team Standup & Sprint Recap',
    tag: 'Agile Sprint Sync',
    verdict: 'Sprint Velocity: On Track',
    html: `
      <div class="tmpl-grid-2col">
        <div class="tmpl-summary-box">
          <h4>Sprint Deliverables &amp; Progress</h4>
          <ul class="tmpl-bullet-list">
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>Completed:</strong> Decoupled Whisper STT streaming pipeline deployed with 240ms P95 latency.</span>
            </li>
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>In Progress:</strong> Executive PDF export rendering engine and Recycle Bin soft-delete tests.</span>
            </li>
            <li class="tmpl-bullet-item">
              <span class="tmpl-bullet-dot">▪</span>
              <span><strong>Blockers:</strong> Zero blockers reported.</span>
            </li>
          </ul>
        </div>

        <div class="tmpl-rubric-card">
          <div class="rubric-row">
            <span class="rubric-label">Open PRs Reviewed</span>
            <span class="rubric-score" style="color:var(--accent-cyan)">8 Merged</span>
          </div>
          <div class="rubric-row">
            <span class="rubric-label">STT Audio Latency</span>
            <span class="rubric-score" style="color:var(--accent-cyan)">240ms</span>
          </div>
          <div class="rubric-row">
            <span class="rubric-label">Sprint Close Target</span>
            <span class="rubric-score" style="color:var(--accent-cyan)">Friday 5 PM</span>
          </div>
        </div>
      </div>
    `
  },

  custom: {
    title: 'Custom Template Builder (Full CRUD)',
    tag: 'Custom Schema & Rubric Editor',
    verdict: 'Instant Schema Sync',
    html: `
      <div class="custom-builder-preview">
        <div class="cb-header">
          <span class="mono" style="color:var(--accent-cyan);font-size:12px">CREATE / EDIT CUSTOM TEMPLATE</span>
          <div class="cb-actions">
            <button class="cb-btn">+ Add Field</button>
            <button class="cb-btn save">Save Template</button>
          </div>
        </div>

        <div class="tmpl-grid-2col">
          <div class="cb-field-row">
            <label class="cb-label">Template Name</label>
            <input type="text" class="cb-input" value="Engineering Incident Post-Mortem">
          </div>
          <div class="cb-field-row">
            <label class="cb-label">Target Evaluation Rubric</label>
            <input type="text" class="cb-input" value="Root Cause, MTTR, Prevention Score">
          </div>
        </div>

        <div class="cb-field-row">
          <label class="cb-label">Custom AI Prompt Instructions</label>
          <input type="text" class="cb-input" value="Extract timestamped incident timeline, immediate fix, and preventative action items.">
        </div>
      </div>
    `
  }
};

function initTemplateSuite() {
  const tabs = document.querySelectorAll('.template-tab-btn');
  const previewBox = document.getElementById('templatePreviewBox');
  if (!previewBox) return;

  function renderTemplate(key) {
    const data = TEMPLATE_DATA[key] || TEMPLATE_DATA.candidate;
    previewBox.innerHTML = `
      <div class="tmpl-header">
        <div class="tmpl-title-box">
          <span class="tmpl-title">${data.title}</span>
          <span class="tmpl-tag">${data.tag}</span>
        </div>
        <span class="tmpl-badge-verdict">${data.verdict}</span>
      </div>
      ${data.html}
    `;
  }

  // Initial render
  renderTemplate('candidate');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const key = tab.getAttribute('data-tmpl');
      renderTemplate(key);
    });
  });
}

/* ══════════ 5 · LIVE EXPERIENCE PLAYGROUND (AI CHAT, DUAL AUDIO & NOTES) ══════════ */
const EXP_PANELS = {
  aichat: `
    <div class="interactive-chat-box">
      <div class="chat-quick-queries">
        <span class="cqq-title mono">Ask real questions:</span>
        <button class="cqq-btn" data-q="What budget cap did the client agree on?">"What budget cap was agreed?"</button>
        <button class="cqq-btn" data-q="What did the candidate say about caching?">"Candidate caching strategy?"</button>
        <button class="cqq-btn" data-q="Summarize the action items for Friday">"Friday action items?"</button>
      </div>

      <div class="chat-history" id="chatHistoryBox">
        <div class="chat-bubble-row user-side">
          <span class="chat-label mono">You (Live Query)</span>
          <div class="chat-bubble-text">"What budget number and timeline did the speaker agree to?"</div>
        </div>
        <div class="chat-bubble-row ai-side">
          <span class="chat-label mono">AI Assistant</span>
          <div class="chat-bubble-text">"The speaker capped monthly cloud spend strictly at $8,000, and you agreed to deliver the updated SOW and PDF architecture summary by Thursday."</div>
        </div>
      </div>

      <div class="chat-interactive-input-row">
        <input type="text" class="chat-real-input" id="chatInput" placeholder="Ask AI anything about the ongoing meeting..." value="What are the key deliverables before Friday?">
        <button class="chat-real-send" id="chatSendBtn">Ask AI</button>
      </div>
    </div>
  `,

  diarization: `
    <div class="feed-stream-container">
      <div class="feed-channel-meta-bar">
        <div class="channel-tag you mono">
          <span class="speaker-dot"></span>
          <span>Channel 1: <strong>YOU (Hardware Mic)</strong></span>
          <span style="color:var(--ink-dim)">· 48kHz PCM</span>
        </div>
        <div class="channel-tag speaker mono">
          <span class="speaker-dot" style="background:var(--accent-indigo);box-shadow:0 0 6px var(--accent-indigo)"></span>
          <span>Channel 2: <strong>SPEAKER (WASAPI Loopback)</strong></span>
          <span style="color:var(--ink-dim)">· System Audio</span>
        </div>
      </div>

      <div class="feed-stream-timeline">
        <div class="feed-card you">
          <div class="feed-avatar">🎙️</div>
          <div class="feed-content">
            <div class="feed-header-line">
              <span class="feed-speaker-title">YOU (Microphone)</span>
              <span class="feed-meta-badge mono">11:00 AM · Latency 220ms</span>
            </div>
            <div class="feed-speech-text">
              "Let us review the required architecture scope and ensure our candidate scorecards are exported to PDF by Friday."
            </div>
          </div>
        </div>

        <div class="feed-card speaker">
          <div class="feed-avatar">🔊</div>
          <div class="feed-content">
            <div class="feed-header-line">
              <span class="feed-speaker-title">SPEAKER (System Audio)</span>
              <span class="feed-meta-badge mono">11:01 AM · Loopback Active</span>
            </div>
            <div class="feed-speech-text">
              "Understood. The new custom templates editor allows us to update the 5-star rubric or add custom criteria on the fly."
            </div>
          </div>
        </div>

        <div class="feed-card you">
          <div class="feed-avatar">🎙️</div>
          <div class="feed-content">
            <div class="feed-header-line">
              <span class="feed-speaker-title">YOU (Microphone)</span>
              <span class="feed-meta-badge mono">11:02 AM · Latency 215ms</span>
            </div>
            <div class="feed-speech-text">
              "Great. I will trigger the 1-click PDF export right after this call."
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  notes: `
    <div class="notes-sandbox">
      <div class="notes-mock-toolbar">
        <span><strong>[B]</strong> Bold</span> · <span><em>[I]</em> Italic</span> · <span>[•] Bullet list</span> · <span>[A±] Font size</span>
      </div>
      <div class="notes-mock-body">
• Client is prioritizing zero downtime for the PostgreSQL database migration.
• Use the 5-Star candidate scorecard template for all backend interview loops.
• Architecture SOW must be signed before provisioning the AWS staging environment.
• Verified all meeting notes stay 100% stored in local SQLite without external cloud sync.
      </div>
    </div>
  `,

  actions: `
    <div class="action-items-list" style="display:flex;flex-direction:column;gap:12px;">
      <div class="action-row" style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid var(--border)">
        <span class="action-check" style="width:20px;height:20px;border-radius:4px;background:rgba(56,189,248,0.15);border:1px solid var(--accent-cyan);color:var(--accent-cyan);display:flex;align-items:center;justify-content:center;font-size:11px">✓</span>
        <span>Deliver formal SOW and architecture diagrams to client by Thursday</span>
      </div>
      <div class="action-row" style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid var(--border)">
        <span class="action-check" style="width:20px;height:20px;border-radius:4px;background:rgba(56,189,248,0.15);border:1px solid var(--accent-cyan);color:var(--accent-cyan);display:flex;align-items:center;justify-content:center;font-size:11px">✓</span>
        <span>Schedule executive follow-up interview with VP of Engineering</span>
      </div>
      <div class="action-row" style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid var(--border)">
        <span class="action-check" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--ink-dim);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--ink-dim)">○</span>
        <span>Export finalized meeting intelligence summary to PDF for stakeholders</span>
      </div>
    </div>
  `
};

function initInteractiveExperience() {
  const tabs = document.querySelectorAll('.exp-tab-btn');
  const body = document.getElementById('expBody');
  if (!body) return;

  function bindChatListeners() {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSendBtn');
    const history = document.getElementById('chatHistoryBox');
    const quickBtns = document.querySelectorAll('.cqq-btn');

    if (!input || !sendBtn || !history) return;

    function handleSend(text) {
      if (!text.trim()) return;
      
      // User message
      const userDiv = document.createElement('div');
      userDiv.className = 'chat-bubble-row user-side';
      userDiv.innerHTML = `
        <span class="chat-label mono">You (Live Query)</span>
        <div class="chat-bubble-text">${escapeHtml(text)}</div>
      `;
      history.appendChild(userDiv);
      input.value = '';
      history.scrollTop = history.scrollHeight;

      // Simulated AI Answer
      setTimeout(() => {
        const aiDiv = document.createElement('div');
        aiDiv.className = 'chat-bubble-row ai-side';
        let response = 'The meeting agreed on completing the candidate evaluation and exporting the PDF report by Friday.';
        
        if (text.toLowerCase().includes('budget') || text.toLowerCase().includes('cost')) {
          response = 'Monthly infrastructure spend is strictly capped at $8,000, with initial setup offset by AWS MAP credits.';
        } else if (text.toLowerCase().includes('caching') || text.toLowerCase().includes('candidate')) {
          response = 'The candidate articulated a two-tier caching architecture (L1 Caffeine + L2 Redis) and the XFetch algorithm for thundering herd prevention.';
        } else if (text.toLowerCase().includes('action') || text.toLowerCase().includes('deliverable') || text.toLowerCase().includes('friday')) {
          response = 'Deliverables: (1) Deliver SOW by Thursday, (2) Submit candidate scorecard, (3) Export 1-click executive PDF summary.';
        }

        aiDiv.innerHTML = `
          <span class="chat-label mono">AI Assistant</span>
          <div class="chat-bubble-text">${response}</div>
        `;
        history.appendChild(aiDiv);
        history.scrollTop = history.scrollHeight;
      }, 450);
    }

    sendBtn.onclick = () => handleSend(input.value);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') handleSend(input.value);
    };

    quickBtns.forEach((btn) => {
      btn.onclick = () => {
        const q = btn.getAttribute('data-q');
        input.value = q;
        handleSend(q);
      };
    });
  }

  function renderExp(key) {
    body.innerHTML = EXP_PANELS[key] || EXP_PANELS.aichat;
    if (key === 'aichat') bindChatListeners();
  }

  // Initial render
  renderExp('aichat');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const key = tab.getAttribute('data-exp');
      renderExp(key);
    });
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

/* ══════════ 6 · FAQ ACCORDION ══════════ */
function initFaqAccordion() {
  const items = document.querySelectorAll('.faq-item');
  items.forEach((item) => {
    const trigger = item.querySelector('.faq-trigger');
    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      items.forEach((i) => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

/* ══════════ 7 · 3D TILT EFFECT ON CARDS ══════════ */
function initTiltCards() {
  const cards = document.querySelectorAll('.tilt-card');
  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      card.style.transform = `perspective(1000px) rotateX(${(-y / rect.height) * 3}deg) rotateY(${(x / rect.width) * 3}deg)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
    });
  });
}

/* ══════════ 8 · HERO SESSION CLOCK TIMER ══════════ */
function initHeroTimer() {
  const timer = document.getElementById('heroTimer');
  if (!timer) return;

  let totalSec = 19 * 60 + 42;
  setInterval(() => {
    totalSec++;
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    timer.innerText = `00:${m}:${s}`;
  }, 1000);
}

/* ══════════ 9 · UNIVERSAL PLATFORM SWITCHER ══════════ */
const PLATFORMS = {
  meet: {
    name: 'Google Meet',
    title: 'Google Meet · Active Call Detected',
    pulseColor: '#00ac47',
    toastTitle: 'Meeting Detected: Google Meet',
    toastSub: 'AI Meeting Assistant auto-captures audio in background',
    youText: '"Let\'s review the required timeline. We need the candidate scorecard finalized and the PDF summary exported before Friday."',
    speakerText: '"Understood. The custom templates editor allows us to update the 5-star evaluation rubric on the fly."',
    actionText: 'Auto Action Item: Export meeting intelligence summary to PDF & sync action items'
  },
  zoom: {
    name: 'Zoom Video',
    title: 'Zoom Video · Active Conference Detected',
    pulseColor: '#2d8cff',
    toastTitle: 'Meeting Detected: Zoom Video',
    toastSub: 'Dual-channel WASAPI loopback streaming active',
    youText: '"How did you handle distributed cache invalidation when scaling your transaction service to 20k RPS?"',
    speakerText: '"We used a multi-tier cache: local in-memory L1 with Caffeine and Redis L2 with Redis Pub/Sub for broadcast invalidation."',
    actionText: 'Auto Action Item: Submit 5-Star candidate evaluation scorecard to hiring team'
  },
  teams: {
    name: 'MS Teams',
    title: 'Microsoft Teams · Active Call Detected',
    pulseColor: '#6264a7',
    toastTitle: 'Meeting Detected: Microsoft Teams',
    toastSub: 'Decoupled Whisper STT engine capturing speech',
    youText: '"We need to review the Q3 cloud migration budget and verify our AWS landing zone IAM policies."',
    speakerText: '"Agreed. Our monthly spend is capped at $8,000 and we will use MAP credits to offset the staging period."',
    actionText: 'Auto Action Item: Finalize AWS infrastructure SOW and credit allocation plan by Thursday'
  },
  slack: {
    name: 'Slack Huddle',
    title: 'Slack Huddle · Audio Detected',
    pulseColor: '#ecb22e',
    toastTitle: 'Audio Detected: Slack Huddle',
    toastSub: 'Real-time background audio recording active',
    youText: '"Let\'s quickly triage the latency regression reported in the streaming audio pipeline."',
    speakerText: '"Found the root cause: we had an unbuffered loopback chunk. Latency is now back down to 240ms."',
    actionText: 'Auto Action Item: Deploy audio buffer hotfix to staging and notify squad leads'
  },
  offline: {
    name: 'In-Person / Mic',
    title: 'In-Person Discussion · Mic Ingestion',
    pulseColor: '#38bdf8',
    toastTitle: 'Microphone Ingestion Active',
    toastSub: 'Local SQLite vault capturing room conversation',
    youText: '"Let\'s align on our engineering career ladders and growth milestones for senior ICs."',
    speakerText: '"Engineers responded very positively to having 2 dedicated research days per sprint and demo Fridays."',
    actionText: 'Auto Action Item: Publish updated technical career ladder handbook next Tuesday'
  }
};

function initPlatformSwitcher() {
  const chips = document.querySelectorAll('.ps-chip');
  const titleEl = document.getElementById('meetingStatusTitle');
  const pulseDot = document.getElementById('statusPulseDot');
  const toastTitle = document.getElementById('toastTitle');
  const youDialogue = document.getElementById('dialogueYou');
  const speakerDialogue = document.getElementById('dialogueSpeaker');
  const actionText = document.getElementById('heroActionText');

  if (!chips.length) return;

  const platformKeys = Object.keys(PLATFORMS);
  let currentIndex = 0;
  let autoCycleTimer = null;

  function switchPlatform(key) {
    const data = PLATFORMS[key];
    if (!data) return;

    // Update active chip
    chips.forEach(c => {
      if (c.getAttribute('data-platform') === key) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    // Update status badge
    if (titleEl) titleEl.innerText = data.title;
    if (pulseDot) {
      pulseDot.style.background = data.pulseColor;
      pulseDot.style.boxShadow = `0 0 8px ${data.pulseColor}`;
    }

    // Update floating toast
    if (toastTitle) toastTitle.innerText = data.toastTitle;

    // Update dialogue lines smoothly
    if (youDialogue) {
      youDialogue.style.opacity = '0';
      setTimeout(() => {
        youDialogue.innerText = data.youText;
        youDialogue.style.opacity = '1';
      }, 150);
    }

    if (speakerDialogue) {
      speakerDialogue.style.opacity = '0';
      setTimeout(() => {
        speakerDialogue.innerText = data.speakerText;
        speakerDialogue.style.opacity = '1';
      }, 150);
    }

    // Update action item
    if (actionText) actionText.innerText = data.actionText;
  }

  // Handle user clicks
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      clearInterval(autoCycleTimer);
      const key = chip.getAttribute('data-platform');
      currentIndex = platformKeys.indexOf(key);
      switchPlatform(key);
    });
  });

  // Auto cycle platform preview every 9 seconds to demonstrate universality
  autoCycleTimer = setInterval(() => {
    currentIndex = (currentIndex + 1) % platformKeys.length;
    switchPlatform(platformKeys[currentIndex]);
  }, 8500);
}

/* ══════════ 10 · HERO EMAIL MODAL PREVIEW ══════════ */
function initHeroEmailModal() {
  const triggerBtn = document.getElementById('heroEmailTriggerBtn');
  const overlay = document.getElementById('emailModalOverlay');
  const closeBtn = document.getElementById('emailModalCloseBtn');
  const sendBtn = document.getElementById('emailModalSendBtn');
  const copyBtn = document.getElementById('emailModalCopyBtn');
  const statusMsg = document.getElementById('emailModalStatusMsg');

  if (!triggerBtn || !overlay) return;

  function openModal() {
    overlay.classList.add('active');
  }

  function closeModal() {
    overlay.classList.remove('active');
  }

  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal();
  });

  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) {
      closeModal();
    }
  });

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      if (statusMsg) {
        statusMsg.innerText = '✓ Executive email dispatched!';
        setTimeout(() => { if (statusMsg) statusMsg.innerText = ''; }, 3500);
      }
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        const text = `Subject: [Executive Summary] Meeting Intelligence & Action Items\n\nHi Team,\nHere is the automated executive summary and action items captured by AI Meeting Assistant:\n\nKey Outcomes:\n- Agreed on AWS Aurora Serverless v2 + ECS Fargate deployment topology.\n- Monthly infrastructure spend strictly capped at $8,000.\n- Candidate evaluation scorecard submitted with Strong Hire verdict.\n\nAssigned Action Items:\n- [You] Deliver formal SOW and credit allocation plan by Thursday.\n- [Team] Provision IAM cross-account staging credentials by Friday.`;
        await navigator.clipboard.writeText(text);
        if (statusMsg) {
          statusMsg.innerText = '✓ Copied draft to clipboard!';
          setTimeout(() => { if (statusMsg) statusMsg.innerText = ''; }, 3500);
        }
      } catch (err) {
        console.warn(err);
      }
    });
  }
}
